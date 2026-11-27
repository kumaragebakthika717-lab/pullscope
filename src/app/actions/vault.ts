"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";
import { aiConfig, generatePlanWithAi, VaultAiError } from "@/lib/vault/ai";
import { autoSlot, buildProgramPlan, isPressDeload, resolveSlot } from "@/lib/vault/program";
import {
  completeInputSchema,
  dateString,
  generateInputSchema,
  importInputSchema,
  planPayloadSchema,
  type PlanPayload,
} from "@/lib/vault/schemas";
import { seedContext } from "@/lib/vault/seed";
import { parseVaultTranscript } from "@/lib/vault/transcript";
import type {
  ExerciseDraft,
  PlanDraft,
  PlanSource,
  TranscriptSummary,
  VaultContext,
  VaultDayPayload,
  VaultResult,
  WorkoutExercise,
  WorkoutPlan,
} from "@/lib/vault/types";

type Db = Awaited<ReturnType<typeof createClient>>;

const SETUP_FILE = "supabase/migrations/0003_vault.sql";
const SETUP_MESSAGE = `The Vault tables are not in your database yet. Run ${SETUP_FILE} in the Supabase SQL editor, then reload this page.`;

type DbError = { code?: string; message?: string } | null;

function isMissingTable(error: DbError): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(message);
}

function dbFail(error: DbError, message = "Could not reach the Vault tables."): VaultResult<never> {
  if (isMissingTable(error)) return { ok: false, error: SETUP_MESSAGE, code: "setup", setupSql: SETUP_FILE };
  return { ok: false, error: message, code: "server" };
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// ---------------------------------------------------------------------------
// Row <-> domain mapping (Supabase returns numeric columns as strings).
// ---------------------------------------------------------------------------

function exerciseFromRow(row: Record<string, unknown>): WorkoutExercise {
  return {
    id: str(row.id),
    plan_id: str(row.plan_id),
    position: num(row.position) ?? 0,
    block: row.block as WorkoutExercise["block"],
    name: str(row.name),
    sets: num(row.sets),
    mass_kg: num(row.mass_kg),
    mass_note: (row.mass_note as string | null) ?? null,
    reps: num(row.reps),
    hold_seconds: num(row.hold_seconds),
    rest_seconds: num(row.rest_seconds),
    intensity_type: row.intensity_type as WorkoutExercise["intensity_type"],
    rpe: num(row.rpe),
    percent_1rm: num(row.percent_1rm),
    notes: (row.notes as string | null) ?? null,
    actual_sets: num(row.actual_sets),
    actual_reps: num(row.actual_reps),
    actual_mass_kg: num(row.actual_mass_kg),
    actual_hold_seconds: num(row.actual_hold_seconds),
    actual_rpe: num(row.actual_rpe),
    done: Boolean(row.done),
  };
}

function planFromRow(row: Record<string, unknown>): WorkoutPlan {
  const nested = Array.isArray(row.workout_exercises) ? (row.workout_exercises as Record<string, unknown>[]) : [];
  return {
    id: str(row.id),
    plan_date: str(row.plan_date),
    title: str(row.title),
    focus: str(row.focus),
    day_type: row.day_type as WorkoutPlan["day_type"],
    status: row.status as WorkoutPlan["status"],
    source: row.source as WorkoutPlan["source"],
    rationale: (row.rationale as string | null) ?? null,
    warnings: Array.isArray(row.warnings) ? (row.warnings as string[]) : [],
    duration_min: num(row.duration_min),
    notes: (row.notes as string | null) ?? null,
    session_notes: (row.session_notes as string | null) ?? null,
    context_exported_at: (row.context_exported_at as string | null) ?? null,
    created_at: str(row.created_at),
    confirmed_at: (row.confirmed_at as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    exercises: nested.map(exerciseFromRow).sort((a, b) => a.position - b.position),
  };
}

function exerciseRow(planId: string, position: number, exercise: ExerciseDraft) {
  return {
    plan_id: planId,
    position,
    block: exercise.block,
    name: exercise.name,
    sets: exercise.sets,
    mass_kg: exercise.mass_kg,
    mass_note: exercise.mass_note,
    reps: exercise.reps,
    hold_seconds: exercise.hold_seconds,
    rest_seconds: exercise.rest_seconds,
    intensity_type: exercise.intensity_type,
    rpe: exercise.rpe,
    percent_1rm: exercise.percent_1rm,
    notes: exercise.notes,
  };
}

async function fetchPlan(db: Db, userId: string, planId: string): Promise<WorkoutPlan | null> {
  const { data } = await db
    .from("workout_plans")
    .select("*, workout_exercises(*)")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ? planFromRow(data as Record<string, unknown>) : null;
}

async function fetchPlanByDate(db: Db, userId: string, date: string): Promise<WorkoutPlan | null> {
  const { data } = await db
    .from("workout_plans")
    .select("*, workout_exercises(*)")
    .eq("user_id", userId)
    .eq("plan_date", date)
    .maybeSingle();
  return data ? planFromRow(data as Record<string, unknown>) : null;
}

async function fetchHistory(db: Db, userId: string, limit = 12): Promise<WorkoutPlan[]> {
  const { data } = await db
    .from("workout_plans")
    .select("*, workout_exercises(*)")
    .eq("user_id", userId)
    .order("plan_date", { ascending: false })
    .limit(limit);
  return (data ?? []).map((row) => planFromRow(row as Record<string, unknown>));
}

// ---------------------------------------------------------------------------
// Chat context row
// ---------------------------------------------------------------------------

type ContextRow = {
  context: VaultContext;
  transcript_tail: string | null;
  transcript_exported_at: string | null;
  updated_at: string;
};

async function readContext(db: Db, userId: string): Promise<VaultResult<ContextRow>> {
  const { data, error } = await db.from("vault_context").select("*").eq("user_id", userId).maybeSingle();
  if (error) return dbFail(error, "Could not read the vault context.") as VaultResult<ContextRow>;
  if (data) {
    const row = data as Record<string, unknown>;
    return {
      ok: true,
      data: {
        context: row.context as VaultContext,
        transcript_tail: (row.transcript_tail as string | null) ?? null,
        transcript_exported_at: (row.transcript_exported_at as string | null) ?? null,
        updated_at: str(row.updated_at),
      },
    };
  }

  const seed = seedContext();
  const insert = {
    user_id: userId,
    context: seed.context,
    transcript_tail: seed.tail,
    transcript_exported_at: seed.context.source.exported_at,
  };
  const { data: created, error: insertError } = await db.from("vault_context").insert(insert).select("*").single();
  if (insertError) {
    if (insertError.code === "23505") {
      const { data: raced } = await db.from("vault_context").select("*").eq("user_id", userId).maybeSingle();
      if (raced) {
        const row = raced as Record<string, unknown>;
        return {
          ok: true,
          data: {
            context: row.context as VaultContext,
            transcript_tail: (row.transcript_tail as string | null) ?? null,
            transcript_exported_at: (row.transcript_exported_at as string | null) ?? null,
            updated_at: str(row.updated_at),
          },
        };
      }
    }
    return dbFail(insertError, "Could not create the vault context.") as VaultResult<ContextRow>;
  }
  const row = created as Record<string, unknown>;
  return {
    ok: true,
    data: {
      context: row.context as VaultContext,
      transcript_tail: (row.transcript_tail as string | null) ?? null,
      transcript_exported_at: (row.transcript_exported_at as string | null) ?? null,
      updated_at: str(row.updated_at),
    },
  };
}

async function writeContext(
  db: Db,
  userId: string,
  patch: { context?: VaultContext; transcript_tail?: string | null; transcript_exported_at?: string | null },
): Promise<string | null> {
  const { error } = await db
    .from("vault_context")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  return error ? error.message : null;
}

// ---------------------------------------------------------------------------
// Plan persistence
// ---------------------------------------------------------------------------

async function replaceExercises(db: Db, planId: string, exercises: ExerciseDraft[]): Promise<string | null> {
  const { data: existing, error: selectError } = await db.from("workout_exercises").select("id").eq("plan_id", planId);
  if (selectError) return selectError.message;
  const oldIds = (existing ?? []).map((row) => (row as { id: string }).id);

  if (exercises.length > 0) {
    const { data: inserted, error: insertError } = await db
      .from("workout_exercises")
      .insert(exercises.map((exercise, index) => exerciseRow(planId, index, exercise)))
      .select("id");
    if (insertError) return insertError.message;
    if (oldIds.length > 0) {
      const { error: deleteError } = await db.from("workout_exercises").delete().in("id", oldIds);
      if (deleteError) {
        const newIds = (inserted ?? []).map((row) => (row as { id: string }).id);
        if (newIds.length > 0) await db.from("workout_exercises").delete().in("id", newIds);
        return deleteError.message;
      }
    }
    return null;
  }

  if (oldIds.length > 0) {
    const { error } = await db.from("workout_exercises").delete().in("id", oldIds);
    if (error) return error.message;
  }
  return null;
}

type WritePlanOptions = {
  source: PlanSource;
  status?: "draft" | "confirmed";
  existingId?: string | null;
  contextExportedAt: string | null;
};

function planFields(date: string, draft: PlanDraft, options: WritePlanOptions) {
  return {
    plan_date: date,
    title: draft.title,
    focus: draft.focus,
    day_type: draft.day_type,
    status: options.status ?? "draft",
    source: options.source,
    rationale: draft.rationale || null,
    warnings: draft.warnings,
    duration_min: draft.duration_min,
    notes: draft.notes,
    context_exported_at: options.contextExportedAt,
  };
}

async function persistDraft(
  db: Db,
  userId: string,
  date: string,
  draft: PlanDraft,
  options: WritePlanOptions,
): Promise<VaultResult<WorkoutPlan>> {
  const fields = planFields(date, draft, options);
  let planId: string;

  if (options.existingId) {
    const { error } = await db
      .from("workout_plans")
      .update(fields)
      .eq("id", options.existingId)
      .eq("user_id", userId);
    if (error) return dbFail(error, "Could not save the plan.") as VaultResult<WorkoutPlan>;
    planId = options.existingId;
  } else {
    const { data, error } = await db
      .from("workout_plans")
      .insert({ user_id: userId, ...fields })
      .select("id")
      .single();
    if (error) return dbFail(error, "Could not save the plan.") as VaultResult<WorkoutPlan>;
    planId = (data as { id: string }).id;
  }

  const exercisesError = await replaceExercises(db, planId, draft.exercises);
  if (exercisesError) return dbFail({ message: exercisesError }, "Could not save the exercises.") as VaultResult<WorkoutPlan>;

  const plan = await fetchPlan(db, userId, planId);
  if (!plan) return { ok: false, error: "The plan was saved but could not be read back.", code: "server" };
  revalidatePath("/vault");
  return { ok: true, data: plan };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function loadVaultDay(date: string): Promise<VaultResult<VaultDayPayload>> {
  const parsedDate = dateString.safeParse(date);
  if (!parsedDate.success) return { ok: false, error: "Use a YYYY-MM-DD date.", code: "invalid" };

  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Not signed in.", code: "unauthorized" };

  const context = await readContext(supabase, user.id);
  if (!context.ok) return context as VaultResult<VaultDayPayload>;

  const { data: planRow, error: planError } = await supabase
    .from("workout_plans")
    .select("*, workout_exercises(*)")
    .eq("user_id", user.id)
    .eq("plan_date", parsedDate.data)
    .maybeSingle();
  if (planError) return dbFail(planError, "Could not read today's plan.") as VaultResult<VaultDayPayload>;

  const history = await fetchHistory(supabase, user.id);
  const config = aiConfig();

  return {
    ok: true,
    data: {
      plan: planRow ? planFromRow(planRow as Record<string, unknown>) : null,
      context: context.data.context,
      context_updated_at: context.data.updated_at || null,
      transcript_exported_at: context.data.transcript_exported_at,
      transcript_chars: context.data.transcript_tail?.length ?? 0,
      history,
      ai_configured: config.configured,
      ai_model: config.configured ? config.model : null,
      auto_slot: autoSlot(parsedDate.data),
    },
  };
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

const generationHits = new Map<string, number[]>();

function generationLimited(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - 10 * 60 * 1000;
  const hits = (generationHits.get(userId) ?? []).filter((t) => t > windowStart);
  if (hits.length >= 15) {
    generationHits.set(userId, hits);
    return true;
  }
  hits.push(now);
  generationHits.set(userId, hits);
  return false;
}

export async function generateWorkout(input: {
  date: string;
  slot?: string;
  notes?: string;
}): Promise<VaultResult<WorkoutPlan>> {
  const parsed = generateInputSchema.safeParse({ notes: "", ...input });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, code: "invalid" };

  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Not signed in.", code: "unauthorized" };
  if (generationLimited(user.id)) {
    return { ok: false, error: "That is a lot of generations. Wait a few minutes and try again.", code: "rate_limited" };
  }

  const context = await readContext(supabase, user.id);
  if (!context.ok) return context as VaultResult<WorkoutPlan>;

  const existing = await fetchPlanByDate(supabase, user.id, parsed.data.date);
  if (existing?.status === "completed") {
    return { ok: false, error: "This day is already completed. Reopen it before generating a new plan.", code: "conflict" };
  }
  if (existing?.status === "confirmed") {
    return { ok: false, error: "This day is confirmed. Reopen it before generating a new plan.", code: "conflict" };
  }

  const slot = resolveSlot(parsed.data.slot, parsed.data.date);
  const history = await fetchHistory(supabase, user.id, 8);
  const transcriptTail = context.data.transcript_tail ?? seedContext().tail;

  let source: PlanSource = "program";
  let draft: PlanDraft;
  let fallbackNote: string | null = null;

  const config = aiConfig();
  if (config.configured) {
    try {
      draft = await generatePlanWithAi({
        date: parsed.data.date,
        slot,
        context: context.data.context,
        history,
        transcriptTail,
        notes: parsed.data.notes,
      });
      source = "ai";
    } catch (error) {
      const message = error instanceof VaultAiError ? error.message : "The AI service failed.";
      draft = buildProgramPlan({ date: parsed.data.date, slot, context: context.data.context });
      fallbackNote = `${message} Used the program engine instead — edit anything before confirming.`;
    }
  } else {
    draft = buildProgramPlan({ date: parsed.data.date, slot, context: context.data.context });
  }

  if (fallbackNote) draft = { ...draft, warnings: [...draft.warnings, fallbackNote] };
  if (parsed.data.notes.trim()) {
    draft = { ...draft, notes: parsed.data.notes.trim() };
  }

  return persistDraft(supabase, user.id, parsed.data.date, draft, {
    source,
    existingId: existing?.id ?? null,
    contextExportedAt: context.data.transcript_exported_at,
  });
}

// ---------------------------------------------------------------------------
// Draft editing and state changes
// ---------------------------------------------------------------------------

export async function saveDraft(input: { date: string; plan: PlanPayload }): Promise<VaultResult<WorkoutPlan>> {
  const parsedDate = dateString.safeParse(input.date);
  if (!parsedDate.success) return { ok: false, error: "Use a YYYY-MM-DD date.", code: "invalid" };
  const parsedPlan = planPayloadSchema.safeParse(input.plan);
  if (!parsedPlan.success) return { ok: false, error: parsedPlan.error.issues[0].message, code: "invalid" };

  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Not signed in.", code: "unauthorized" };

  const context = await readContext(supabase, user.id);
  if (!context.ok) return context as VaultResult<WorkoutPlan>;

  const existing = await fetchPlanByDate(supabase, user.id, parsedDate.data);
  if (existing && existing.status !== "draft") {
    return { ok: false, error: "Only drafts can be edited. Reopen this day first.", code: "conflict" };
  }

  const p = parsedPlan.data;
  const draft: PlanDraft = {
    title: p.title,
    focus: p.focus,
    day_type: p.day_type,
    rationale: p.rationale ?? "",
    warnings: p.warnings,
    duration_min: p.duration_min,
    notes: p.notes,
    exercises: p.exercises,
  };

  return persistDraft(supabase, user.id, parsedDate.data, draft, {
    source: existing?.source ?? "manual",
    existingId: existing?.id ?? null,
    contextExportedAt: context.data.transcript_exported_at,
  });
}

export async function confirmWorkout(planId: string): Promise<VaultResult<WorkoutPlan>> {
  if (!/^[0-9a-f-]{36}$/i.test(planId)) return { ok: false, error: "Invalid plan.", code: "invalid" };
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Not signed in.", code: "unauthorized" };

  const plan = await fetchPlan(supabase, user.id, planId);
  if (!plan) return { ok: false, error: "Plan not found.", code: "not_found" };
  if (plan.status === "completed") return { ok: false, error: "This day is already completed.", code: "conflict" };

  const { error } = await supabase
    .from("workout_plans")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", planId)
    .eq("user_id", user.id);
  if (error) return dbFail(error, "Could not confirm the plan.") as VaultResult<WorkoutPlan>;

  revalidatePath("/vault");
  const updated = await fetchPlan(supabase, user.id, planId);
  return updated ? { ok: true, data: updated } : { ok: false, error: "Plan not found.", code: "not_found" };
}

export async function reopenWorkout(planId: string): Promise<VaultResult<WorkoutPlan>> {
  if (!/^[0-9a-f-]{36}$/i.test(planId)) return { ok: false, error: "Invalid plan.", code: "invalid" };
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Not signed in.", code: "unauthorized" };

  const { error } = await supabase
    .from("workout_plans")
    .update({ status: "draft", confirmed_at: null, completed_at: null })
    .eq("id", planId)
    .eq("user_id", user.id);
  if (error) return dbFail(error, "Could not reopen the plan.") as VaultResult<WorkoutPlan>;

  revalidatePath("/vault");
  const updated = await fetchPlan(supabase, user.id, planId);
  return updated ? { ok: true, data: updated } : { ok: false, error: "Plan not found.", code: "not_found" };
}

export async function deleteDraft(planId: string): Promise<VaultResult<null>> {
  if (!/^[0-9a-f-]{36}$/i.test(planId)) return { ok: false, error: "Invalid plan.", code: "invalid" };
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Not signed in.", code: "unauthorized" };

  const plan = await fetchPlan(supabase, user.id, planId);
  if (!plan) return { ok: false, error: "Plan not found.", code: "not_found" };
  if (plan.status !== "draft") return { ok: false, error: "Only drafts can be discarded.", code: "conflict" };

  const { error } = await supabase.from("workout_plans").delete().eq("id", planId).eq("user_id", user.id);
  if (error) return dbFail(error, "Could not discard the plan.") as VaultResult<null>;

  revalidatePath("/vault");
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Completion + context refresh
// ---------------------------------------------------------------------------

function sessionSummary(plan: WorkoutPlan): string {
  const parts = plan.exercises
    .filter((e) => e.block === "main" || e.block === "jump")
    .slice(0, 6)
    .map((e) => {
      const sets = e.actual_sets ?? e.sets;
      const reps = e.actual_hold_seconds ? `${e.actual_hold_seconds}s` : (e.actual_reps ?? e.reps);
      const mass = e.actual_mass_kg ?? e.mass_kg;
      return `${e.name} ${sets ?? "?"}×${reps ?? "?"}${mass ? ` @${mass}` : ""}`;
    });
  return parts.join(", ");
}

async function recordCompletion(db: Db, userId: string, plan: WorkoutPlan): Promise<void> {
  const read = await readContext(db, userId);
  if (!read.ok) return;

  const context: VaultContext = structuredClone(read.data.context);
  const today = plan.plan_date;
  const isPress = plan.day_type === "press_heavy" || plan.day_type === "press_volume" || plan.day_type === "press_speed";
  const isLower = plan.day_type === "lower_a" || plan.day_type === "lower_b";

  const summary = sessionSummary(plan);
  const entry = {
    date: today,
    session: plan.focus ? `${plan.title} — ${plan.focus}` : plan.title,
    done: summary || "Completed",
  };
  // One plan per day: re-completing a reopened session corrects the entry, it does not count twice.
  const recompleted = context.recent_sessions.some((s) => s.date === today);
  if (!recompleted) {
    if (isPress) context.progress.press_sessions_done += 1;
    if (isLower) context.progress.leg_sessions_done += 1;
    context.recent_sessions = [entry, ...context.recent_sessions].slice(0, 12);
  } else {
    context.recent_sessions = context.recent_sessions.map((s) => (s.date === today ? entry : s));
  }

  let progression = "";
  if (isPress && !isPressDeload(today)) {
    const next = context.next_sessions[plan.day_type];
    const main = plan.exercises.filter((e) => e.block === "main" && e.mass_kg !== null);
    const allDone = main.length > 0 && main.every((e) => e.done);
    const maxRpe = Math.max(...main.map((e) => e.actual_rpe ?? e.rpe ?? 10), 0);
    const topMass = Math.max(...main.map((e) => e.mass_kg ?? 0), 0);
    if (next && allDone && maxRpe <= 8 && topMass > 0) {
      next.mass_kg = Math.round((topMass + 2.5) * 2) / 2;
      next.note = `Auto-progressed after ${today}: every main set finished at RPE ≤ ${maxRpe}.`;
      progression = ` ${plan.day_type.replace("_", " ")} load moves to ${next.mass_kg} kg.`;
    }
  }

  context.progress.note = `Last completed ${today}: ${plan.title}.${progression}`;

  await writeContext(db, userId, { context });
}

export async function completeWorkout(input: {
  planId: string;
  sessionNotes: string | null;
  exercises: {
    id: string;
    done: boolean;
    actual_sets: number | null;
    actual_reps: number | null;
    actual_mass_kg: number | null;
    actual_hold_seconds: number | null;
    actual_rpe: number | null;
  }[];
}): Promise<VaultResult<WorkoutPlan>> {
  const parsed = completeInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, code: "invalid" };

  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Not signed in.", code: "unauthorized" };

  const plan = await fetchPlan(supabase, user.id, parsed.data.planId);
  if (!plan) return { ok: false, error: "Plan not found.", code: "not_found" };

  const { error } = await supabase
    .from("workout_plans")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      session_notes: parsed.data.sessionNotes,
    })
    .eq("id", plan.id)
    .eq("user_id", user.id);
  if (error) return dbFail(error, "Could not complete the plan.") as VaultResult<WorkoutPlan>;

  const writes = await Promise.all(
    parsed.data.exercises.map((e) =>
      supabase
        .from("workout_exercises")
        .update({
          done: e.done,
          actual_sets: e.actual_sets,
          actual_reps: e.actual_reps,
          actual_mass_kg: e.actual_mass_kg,
          actual_hold_seconds: e.actual_hold_seconds,
          actual_rpe: e.actual_rpe,
        })
        .eq("id", e.id)
        .eq("plan_id", plan.id),
    ),
  );
  const writeError = writes.find((r) => r.error)?.error;
  if (writeError) return dbFail(writeError, "The session was marked complete but some actuals did not save.") as VaultResult<WorkoutPlan>;

  const updated = await fetchPlan(supabase, user.id, plan.id);
  if (!updated) return { ok: false, error: "Plan not found.", code: "not_found" };

  try {
    await recordCompletion(supabase, user.id, updated);
  } catch {
    // The workout is saved; a context refresh can be retried on the next completion.
  }

  revalidatePath("/vault");
  return { ok: true, data: updated };
}

// ---------------------------------------------------------------------------
// Chat export import
// ---------------------------------------------------------------------------

export async function importTranscript(input: { text: string; exportedAt?: string | null }): Promise<VaultResult<TranscriptSummary>> {
  const parsedInput = importInputSchema.safeParse(input);
  if (!parsedInput.success) return { ok: false, error: parsedInput.error.issues[0].message, code: "invalid" };

  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Not signed in.", code: "unauthorized" };

  const parsed = parseVaultTranscript(parsedInput.data.text);
  if (parsed.messages.length === 0) {
    return {
      ok: false,
      error: "No chat messages found. Export the Ultimate Strength Vault chat as Markdown and paste the whole file.",
      code: "invalid",
    };
  }

  const context = await readContext(supabase, user.id);
  if (!context.ok) return context as VaultResult<TranscriptSummary>;

  const merged: VaultContext = structuredClone(context.data.context);
  const notes: string[] = [];

  const asOf = (parsed.exportedAt ?? parsedInput.data.exportedAt ?? new Date().toISOString()).slice(0, 10);
  for (const test of parsed.facts.tests) {
    const index = merged.latest_tests.findIndex((t) => t.lift.toLowerCase() === test.lift.toLowerCase());
    if (index >= 0) {
      const previous = merged.latest_tests[index];
      const unchanged = Math.abs(previous.kg - test.kg) < 0.05;
      merged.latest_tests[index] = {
        lift: test.lift,
        kg: test.kg,
        // Keep the known test date when the max did not move; otherwise stamp the export date.
        date: unchanged ? previous.date : asOf,
        note: unchanged ? previous.note : "Updated from chat import.",
      };
      notes.push(unchanged ? `${test.lift} confirmed at ${test.kg} kg` : `${test.lift} → ${test.kg} kg (replaces the older test)`);
    } else {
      merged.latest_tests.push({ lift: test.lift, kg: test.kg, date: asOf, note: "Added from chat import." });
      notes.push(`${test.lift} → ${test.kg} kg`);
    }
  }

  if (parsed.facts.pressSessionsDone !== null && parsed.facts.pressSessionsDone > merged.progress.press_sessions_done) {
    merged.progress.press_sessions_done = parsed.facts.pressSessionsDone;
    notes.push(`Press sessions logged: ${parsed.facts.pressSessionsDone}`);
  }
  if (parsed.facts.legSessionsDone !== null && parsed.facts.legSessionsDone > merged.progress.leg_sessions_done) {
    merged.progress.leg_sessions_done = parsed.facts.legSessionsDone;
    notes.push(`Leg sessions logged: ${parsed.facts.legSessionsDone}`);
  }
  for (const limitation of parsed.facts.limitations) {
    if (!merged.limitations.some((l) => l.toLowerCase() === limitation.toLowerCase())) {
      merged.limitations.push(limitation);
      notes.push(`Limitation noted: ${limitation}`);
    }
  }

  const exportedAt = parsed.exportedAt ?? parsedInput.data.exportedAt ?? new Date().toISOString();
  merged.source.exported_at = exportedAt;
  notes.push(`Stored the last ${parsed.tail.length.toLocaleString()} characters of the chat for generation.`);

  const error = await writeContext(supabase, user.id, {
    context: merged,
    transcript_tail: parsed.tail,
    transcript_exported_at: exportedAt,
  });
  if (error) {
    const setup = isMissingTable({ message: error });
    return setup
      ? { ok: false, error: SETUP_MESSAGE, code: "setup", setupSql: SETUP_FILE }
      : { ok: false, error, code: "server" };
  }

  revalidatePath("/vault");
  return {
    ok: true,
    data: {
      messages: parsed.messages.length,
      chars: parsedInput.data.text.length,
      exported_at: exportedAt,
      extracted: parsed.highlights,
      notes,
    },
  };
}

