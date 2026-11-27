import { z } from "zod";
import { DAY_SLOTS, EXERCISE_BLOCKS, type ExerciseDraft } from "./types";

export const CONCRETE_SLOTS = DAY_SLOTS.filter((s): s is Exclude<(typeof DAY_SLOTS)[number], "auto"> => s !== "auto");

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Invalid calendar date");

const bounded = (min: number, max: number) => z.number().finite().min(min).max(max).nullable();

export const exerciseInputSchema = z.object({
  block: z.enum(EXERCISE_BLOCKS),
  name: z.string().trim().min(1, "Exercise name is required").max(120),
  sets: bounded(0, 30),
  mass_kg: bounded(0, 600),
  mass_note: z.string().trim().max(120).nullable(),
  reps: bounded(0, 200),
  hold_seconds: bounded(0, 900),
  rest_seconds: bounded(0, 900),
  intensity_type: z.enum(["rpe", "percent_1rm", "none"]),
  rpe: bounded(0, 10),
  percent_1rm: bounded(0, 100),
  notes: z.string().trim().max(500).nullable(),
});

export const planPayloadSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(160),
    focus: z.string().trim().max(120),
    day_type: z.enum(CONCRETE_SLOTS),
    rationale: z.string().trim().max(2000).nullable(),
    warnings: z.array(z.string().trim().max(300)).max(10),
    duration_min: bounded(0, 240),
    notes: z.string().trim().max(2000).nullable(),
    exercises: z.array(exerciseInputSchema).max(40),
  })
  .refine((v) => v.day_type === "rest" || v.exercises.length > 0, {
    message: "A training day needs at least one exercise",
    path: ["exercises"],
  });

export type PlanPayload = z.infer<typeof planPayloadSchema>;

export const generateInputSchema = z.object({
  date: dateString,
  slot: z.enum(DAY_SLOTS).default("auto"),
  notes: z.string().trim().max(600).default(""),
});

export const completeInputSchema = z.object({
  planId: z.string().uuid(),
  sessionNotes: z.string().trim().max(1000).nullable(),
  exercises: z
    .array(
      z.object({
        id: z.string().uuid(),
        done: z.boolean(),
        actual_sets: bounded(0, 30),
        actual_reps: bounded(0, 200),
        actual_mass_kg: bounded(0, 600),
        actual_hold_seconds: bounded(0, 900),
        actual_rpe: bounded(0, 10),
      }),
    )
    .max(40),
});

export const importInputSchema = z.object({
  text: z.string().min(100, "The export looks empty").max(3_000_000, "Export is too large (max 3 MB)"),
  exportedAt: z.string().datetime().optional().nullable(),
});

export { dateString };

// ---------------------------------------------------------------------------
// Model output is looser than the editor payload: coerce "30 kg" / "4–6" and
// let missing optional fields fall back rather than failing the whole plan.
// ---------------------------------------------------------------------------

const looseNumber = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const m = v.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  }
  return null;
}, z.number().nullable());

const aiExerciseSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    block: z.enum(EXERCISE_BLOCKS).catch("main"),
    sets: looseNumber,
    mass_kg: looseNumber,
    mass_note: z.string().trim().max(120).nullable().catch(null),
    reps: looseNumber,
    hold_seconds: looseNumber,
    rest_seconds: looseNumber,
    intensity_type: z.enum(["rpe", "percent_1rm", "none"]).optional(),
    rpe: looseNumber,
    percent_1rm: looseNumber,
    notes: z.string().trim().max(500).nullable().catch(null),
  })
  .transform((v): ExerciseDraft => {
    const hold = v.hold_seconds !== null && v.hold_seconds > 0 ? v.hold_seconds : null;
    const reps = hold === null && v.reps !== null ? v.reps : null;
    const percent = v.percent_1rm !== null && v.percent_1rm > 0 && v.percent_1rm <= 100 ? v.percent_1rm : null;
    const rpe = v.rpe !== null && v.rpe >= 1 && v.rpe <= 10 ? v.rpe : null;
    const intensity_type =
      v.intensity_type === "none" ? "none" : percent !== null ? "percent_1rm" : rpe !== null ? "rpe" : "none";
    return {
      block: v.block,
      name: v.name,
      sets: v.sets !== null && v.sets >= 0 ? Math.round(v.sets) : null,
      mass_kg: v.mass_kg,
      mass_note: v.mass_note,
      reps: reps !== null ? Math.round(reps) : null,
      hold_seconds: hold !== null ? Math.round(hold) : null,
      rest_seconds: v.rest_seconds !== null ? Math.round(v.rest_seconds) : null,
      intensity_type,
      rpe: intensity_type === "rpe" ? rpe : null,
      percent_1rm: intensity_type === "percent_1rm" ? percent : null,
      notes: v.notes,
    };
  });

export const aiPlanSchema = z.object({
  title: z.string().trim().min(1).max(160),
  focus: z.string().trim().max(120).optional().default(""),
  rationale: z.string().trim().max(2000).optional().default(""),
  warnings: z.array(z.string().trim().max(300)).max(10).optional().default([]),
  duration_min: looseNumber,
  exercises: z.array(aiExerciseSchema).max(40),
});

export type AiPlan = z.infer<typeof aiPlanSchema>;