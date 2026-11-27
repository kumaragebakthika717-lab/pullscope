import type { PlanPayload } from "./schemas";
import type { ExerciseBlock, ExerciseDraft, WorkoutExercise, WorkoutPlan } from "./types";

export const BLOCK_LABELS: Record<ExerciseBlock, string> = {
  warmup: "Warm-up",
  jump: "Jump",
  main: "Main",
  accessory: "Accessory",
  conditioning: "Conditioning",
  cooldown: "Cool-down",
};

export const BLOCK_OPTIONS = Object.entries(BLOCK_LABELS) as [ExerciseBlock, string][];

export function todayLocal(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function prettyDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

export function shortDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
    new Date(`${date}T12:00:00`),
  );
}

export function formatRest(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 60) return `${seconds} s`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function massText(exercise: ExerciseDraft | WorkoutExercise): string {
  if (exercise.mass_kg !== null) {
    return `${exercise.mass_kg} kg${exercise.mass_note ? ` (${exercise.mass_note})` : ""}`;
  }
  return exercise.mass_note ?? "—";
}

export function repsText(exercise: ExerciseDraft | WorkoutExercise): string {
  if (exercise.hold_seconds !== null) return `${exercise.hold_seconds} s hold`;
  if (exercise.reps !== null) return `${exercise.reps} reps`;
  return "—";
}

export function intensityText(exercise: ExerciseDraft | WorkoutExercise): string {
  if (exercise.intensity_type === "percent_1rm" && exercise.percent_1rm !== null) {
    return `${exercise.percent_1rm}% 1RM`;
  }
  if (exercise.intensity_type === "rpe" && exercise.rpe !== null) return `RPE ${exercise.rpe}`;
  return "—";
}

export function exerciseSummary(exercise: ExerciseDraft | WorkoutExercise): string {
  return [
    exercise.sets !== null ? `${exercise.sets} sets` : null,
    massText(exercise),
    repsText(exercise),
    intensityText(exercise),
    exercise.rest_seconds !== null ? `${formatRest(exercise.rest_seconds)} rest` : null,
  ]
    .filter((part) => part && part !== "—")
    .join(" · ");
}

export function actualSummary(exercise: WorkoutExercise): string | null {
  if (!exercise.done) return null;
  const sets = exercise.actual_sets ?? exercise.sets;
  const reps = exercise.actual_hold_seconds ?? exercise.hold_seconds;
  const mass = exercise.actual_mass_kg ?? exercise.mass_kg;
  const rpe = exercise.actual_rpe ?? exercise.rpe;
  return [
    sets !== null ? `${sets} sets` : null,
    mass !== null ? `${mass} kg` : null,
    reps !== null ? (exercise.hold_seconds !== null ? `${reps} s` : `${reps} reps`) : null,
    rpe !== null ? `RPE ${rpe}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function planToPayload(plan: WorkoutPlan): PlanPayload {
  return {
    title: plan.title,
    focus: plan.focus,
    day_type: plan.day_type,
    rationale: plan.rationale,
    warnings: plan.warnings,
    duration_min: plan.duration_min,
    notes: plan.notes,
    exercises: plan.exercises.map(
      (e): ExerciseDraft => ({
        block: e.block,
        name: e.name,
        sets: e.sets,
        mass_kg: e.mass_kg,
        mass_note: e.mass_note,
        reps: e.reps,
        hold_seconds: e.hold_seconds,
        rest_seconds: e.rest_seconds,
        intensity_type: e.intensity_type,
        rpe: e.rpe,
        percent_1rm: e.percent_1rm,
        notes: e.notes,
      }),
    ),
  };
}

export function planDigest(plan: WorkoutPlan): string {
  const lines: string[] = [];
  lines.push(`## ${prettyDate(plan.plan_date)} — ${plan.title}`);
  lines.push(
    `Status: ${plan.status} · Focus: ${plan.focus || "—"} · Source: ${plan.source}${
      plan.duration_min ? ` · ~${plan.duration_min} min` : ""
    }`,
  );
  if (plan.rationale) lines.push(plan.rationale);
  if (plan.exercises.length === 0) lines.push("Rest day — no loading.");
  for (const block of Object.keys(BLOCK_LABELS) as ExerciseBlock[]) {
    const rows = plan.exercises.filter((e) => e.block === block);
    if (rows.length === 0) continue;
    lines.push(`**${BLOCK_LABELS[block]}**`);
    for (const e of rows) {
      const actual = actualSummary(e);
      lines.push(`- ${e.name}: ${exerciseSummary(e)}${actual ? ` → did ${actual}` : ""}`);
    }
  }
  if (plan.notes) lines.push(`Notes: ${plan.notes}`);
  if (plan.session_notes) lines.push(`Session notes: ${plan.session_notes}`);
  if (plan.warnings.length > 0) lines.push(`Warnings: ${plan.warnings.join(" | ")}`);
  return lines.join("\n");
}