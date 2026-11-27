export const DAY_SLOTS = [
  "auto",
  "press_heavy",
  "press_volume",
  "press_speed",
  "lower_a",
  "lower_b",
  "conditioning",
  "rest",
] as const;
export type DaySlot = (typeof DAY_SLOTS)[number];
export type ConcreteSlot = Exclude<DaySlot, "auto">;

export const EXERCISE_BLOCKS = ["warmup", "jump", "main", "accessory", "conditioning", "cooldown"] as const;
export type ExerciseBlock = (typeof EXERCISE_BLOCKS)[number];

export type IntensityType = "rpe" | "percent_1rm" | "none";
export type PlanStatus = "draft" | "confirmed" | "completed" | "skipped";
export type PlanSource = "ai" | "program" | "manual";

export type WorkoutExercise = {
  id: string;
  plan_id: string;
  position: number;
  block: ExerciseBlock;
  name: string;
  sets: number | null;
  mass_kg: number | null;
  mass_note: string | null;
  reps: number | null;
  hold_seconds: number | null;
  rest_seconds: number | null;
  intensity_type: IntensityType;
  rpe: number | null;
  percent_1rm: number | null;
  notes: string | null;
  actual_sets: number | null;
  actual_reps: number | null;
  actual_mass_kg: number | null;
  actual_hold_seconds: number | null;
  actual_rpe: number | null;
  done: boolean;
};

export type WorkoutPlan = {
  id: string;
  user_id?: string;
  plan_date: string;
  title: string;
  focus: string;
  day_type: ConcreteSlot;
  status: PlanStatus;
  source: PlanSource;
  rationale: string | null;
  warnings: string[];
  duration_min: number | null;
  notes: string | null;
  session_notes: string | null;
  context_exported_at: string | null;
  created_at: string;
  confirmed_at: string | null;
  completed_at: string | null;
  exercises: WorkoutExercise[];
};

export type ExerciseDraft = Omit<
  WorkoutExercise,
  "id" | "plan_id" | "position" | "actual_sets" | "actual_reps" | "actual_mass_kg" | "actual_hold_seconds" | "actual_rpe" | "done"
>;

export type PlanDraft = {
  title: string;
  focus: string;
  day_type: ConcreteSlot;
  rationale: string;
  warnings: string[];
  duration_min: number | null;
  notes: string | null;
  exercises: ExerciseDraft[];
};

export type TrainingGoal = { lift: string; target_kg: number; by: string; note?: string };
export type LatestTest = { lift: string; kg: number; date: string; note?: string };
export type NextSession = { label: string; sets: number; reps: number; mass_kg: number; rpe: number; note: string };
export type RecentSession = { date: string; session: string; done: string };

export type VaultContext = {
  units: "kg";
  athlete: { bodyweight_kg: number | null; height_cm: number | null; note: string };
  goals: TrainingGoal[];
  current_block: { name: string; starts: string; ends: string; press_frequency: string; notes: string[] };
  schedule: { day: string; session: string; press: string | null }[];
  latest_tests: LatestTest[];
  next_sessions: Record<string, NextSession>;
  loads: { lift: string; kg: number; note?: string }[];
  equipment: string[];
  limitations: string[];
  recent_sessions: RecentSession[];
  progress: { press_sessions_done: number; leg_sessions_done: number; note: string };
  source: { chat: string; exported_at: string; files: string[] };
};

export type VaultDayPayload = {
  plan: WorkoutPlan | null;
  context: VaultContext;
  context_updated_at: string | null;
  transcript_exported_at: string | null;
  transcript_chars: number;
  history: WorkoutPlan[];
  ai_configured: boolean;
  ai_model: string | null;
  auto_slot: ConcreteSlot;
};

export type VaultErrorCode =
  | "unauthorized"
  | "invalid"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "setup"
  | "ai_failed"
  | "server";

export type VaultResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: VaultErrorCode; setupSql?: string };

export type TranscriptSummary = {
  messages: number;
  chars: number;
  exported_at: string | null;
  extracted: string[];
  notes: string[];
};