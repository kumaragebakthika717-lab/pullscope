import type { ConcreteSlot, DaySlot, ExerciseDraft, PlanDraft, VaultContext } from "./types";

// Sunday-first, matching Date#getUTCDay() for a YYYY-MM-DD string.
const WEEKDAY_SLOTS: ConcreteSlot[] = [
  "rest",
  "press_heavy",
  "lower_a",
  "conditioning",
  "press_volume",
  "lower_b",
  "press_speed",
];

export const SLOT_LABELS: Record<ConcreteSlot, string> = {
  press_heavy: "Press A · Heavy",
  press_volume: "Press B · Volume",
  press_speed: "Press C · Speed",
  lower_a: "Jump + Strength A",
  lower_b: "Jump (low) + Strength B",
  conditioning: "Zone 2 + Mobility",
  rest: "Rest & Mobility",
};

export function weekdayName(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

export function autoSlot(date: string): ConcreteSlot {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return WEEKDAY_SLOTS[day] ?? "rest";
}

export function resolveSlot(slot: DaySlot, date: string): ConcreteSlot {
  return slot === "auto" ? autoSlot(date) : slot;
}

/** Lower body deload + retest week from the month plan. */
export function isLowerDeload(date: string): boolean {
  return date >= "2026-11-23" && date <= "2026-11-29";
}

/** Press deload + retest week from PRESS-100KG-PLAN.md. */
export function isPressDeload(date: string): boolean {
  return date >= "2026-11-30" && date <= "2026-12-06";
}

function ex(p: Partial<ExerciseDraft> & Pick<ExerciseDraft, "name" | "block">): ExerciseDraft {
  return {
    sets: null,
    mass_kg: null,
    mass_note: null,
    reps: null,
    hold_seconds: null,
    rest_seconds: null,
    intensity_type: "rpe",
    rpe: null,
    percent_1rm: null,
    notes: null,
    ...p,
  };
}

function pressWarmup(): ExerciseDraft[] {
  return [
    ex({ name: "Band pull-apart", block: "warmup", sets: 2, reps: 15, rest_seconds: 45, rpe: 5 }),
    ex({ name: "Face pull (light)", block: "warmup", sets: 2, reps: 15, rest_seconds: 45, rpe: 5 }),
    ex({ name: "Shoulder circles / wall slides", block: "warmup", sets: 1, reps: 10, rest_seconds: 30, rpe: 4 }),
    ex({ name: "Scapular push-up", block: "warmup", sets: 1, reps: 10, rest_seconds: 30, rpe: 4 }),
    ex({ name: "Empty-bar seated press", block: "warmup", sets: 1, reps: 10, rest_seconds: 120, rpe: 4, mass_note: "empty bar" }),
  ];
}

function lowerWarmup(): ExerciseDraft[] {
  return [
    ex({ name: "Bike (easy)", block: "warmup", sets: 1, hold_seconds: 180, rest_seconds: 0, rpe: 4 }),
    ex({ name: "Leg swings front/back, side/side", block: "warmup", sets: 2, reps: 8, rest_seconds: 30, rpe: 4, notes: "each direction" }),
    ex({ name: "Ankle rocks", block: "warmup", sets: 2, reps: 10, rest_seconds: 30, rpe: 4, notes: "each side" }),
    ex({ name: "Glute bridge", block: "warmup", sets: 2, reps: 10, rest_seconds: 30, rpe: 4 }),
    ex({ name: "Bodyweight squat", block: "warmup", sets: 1, reps: 10, rest_seconds: 30, rpe: 4 }),
    ex({ name: "Empty-bar Zercher hold", block: "warmup", sets: 2, hold_seconds: 20, rest_seconds: 45, rpe: 5, mass_note: "empty bar" }),
    ex({ name: "Empty-bar RDL", block: "warmup", sets: 2, reps: 8, rest_seconds: 45, rpe: 4, mass_note: "empty bar" }),
  ];
}

function pressHeavy(context: VaultContext, deload: boolean): PlanDraft {
  const next = context.next_sessions.press_heavy;
  if (deload) {
    return {
      title: "Press · Deload",
      focus: "Press recovery",
      day_type: "press_heavy",
      rationale: "Press deload week (30 Nov – 6 Dec): cut sets, keep the pattern, leave the gym fresher than you arrived.",
      warnings: ["Deload — no grinding. Retest 5RM on 5 Dec."],
      duration_min: 25,
      notes: null,
      exercises: [
        ...pressWarmup().slice(0, 4),
        ex({ name: "Seated press", block: "main", sets: 3, reps: 5, mass_kg: 27.5, rpe: 6, rest_seconds: 150 }),
        ex({ name: "Face pull (light)", block: "accessory", sets: 2, reps: 15, rest_seconds: 60, rpe: 5 }),
        ex({ name: "Lateral raise", block: "accessory", sets: 2, reps: 12, mass_kg: 6, rest_seconds: 60, rpe: 5 }),
      ],
    };
  }
  return {
    title: SLOT_LABELS.press_heavy,
    focus: "Press strength",
    day_type: "press_heavy",
    rationale:
      "Heavy press day from Block 1. Top sets are capped at RPE 8 so the next volume day stays productive.",
    warnings: ["Cap press work at 18 sets/week.", "If set 2 is already RPE 9, cut to 3 top sets and keep the load."],
    duration_min: 45,
    notes: null,
    exercises: [
      ...pressWarmup(),
      ex({
        name: "Seated press",
        block: "main",
        sets: next.sets,
        reps: next.reps,
        mass_kg: next.mass_kg,
        rpe: next.rpe,
        rest_seconds: 180,
        notes: "Ramp: 15×5 → 20×3 → 25×2 → 30×1. No grinding reps on the ramp.",
      }),
      ex({ name: "Seated press back-off", block: "main", sets: 2, reps: 5, mass_kg: 27.5, rpe: 7, rest_seconds: 150 }),
      ex({ name: "Close-grip bench", block: "accessory", sets: 3, reps: 6, rpe: 8, rest_seconds: 90, notes: "Load to RPE 8; triceps buy the lockout." }),
      ex({ name: "Lateral raise", block: "accessory", sets: 3, reps: 12, mass_kg: 6, rest_seconds: 60, rpe: 7 }),
      ex({ name: "Chest-supported row", block: "accessory", sets: 3, reps: 10, rpe: 7, rest_seconds: 60 }),
    ],
  };
}

function pressVolume(context: VaultContext): PlanDraft {
  const next = context.next_sessions.press_volume;
  return {
    title: SLOT_LABELS.press_volume,
    focus: "Upper-body volume",
    day_type: "press_volume",
    rationale: "Volume press day: five clean sets at a load you could repeat tomorrow. Set five should still look like set one.",
    warnings: ["Cap press work at 18 sets/week.", "If set 3 hits RPE 9, drop the last set rather than the load."],
    duration_min: 40,
    notes: null,
    exercises: [
      ...pressWarmup(),
      ex({
        name: "Seated press",
        block: "main",
        sets: next.sets,
        reps: next.reps,
        mass_kg: next.mass_kg,
        rpe: next.rpe,
        rest_seconds: 180,
        notes: "Same load across all five sets. Ramp takes the first two sets' freshness into account.",
      }),
      ex({ name: "Seated DB press", block: "accessory", sets: 3, reps: 8, mass_kg: 12, mass_note: "per hand", rpe: 8, rest_seconds: 90 }),
      ex({ name: "Triceps pushdown", block: "accessory", sets: 3, reps: 12, rpe: 7, rest_seconds: 60 }),
      ex({ name: "Face pull", block: "accessory", sets: 3, reps: 15, rpe: 6, rest_seconds: 60 }),
      ex({ name: "Chest-supported row", block: "accessory", sets: 3, reps: 8, rpe: 7, rest_seconds: 90 }),
    ],
  };
}

function pressSpeed(context: VaultContext): PlanDraft {
  const next = context.next_sessions.press_speed;
  return {
    title: SLOT_LABELS.press_speed,
    focus: "Press speed",
    day_type: "press_speed",
    rationale: "Speed day: fast reps, short rests, no grind. Bar speed is the target, not the load.",
    warnings: ["Stop the set when bar speed visibly drops."],
    duration_min: 40,
    notes: null,
    exercises: [
      ...pressWarmup(),
      ex({
        name: "Seated press, pause at chin",
        block: "main",
        sets: next.sets,
        reps: next.reps,
        mass_kg: next.mass_kg,
        rpe: next.rpe,
        rest_seconds: 90,
        notes: "2 s pause at the chin. Every rep fast and clean.",
      }),
      ex({ name: "Close-grip bench", block: "accessory", sets: 4, reps: 6, rpe: 8, rest_seconds: 90 }),
      ex({ name: "Face pull", block: "accessory", sets: 3, reps: 15, rpe: 6, rest_seconds: 60 }),
      ex({ name: "Ab wheel", block: "accessory", sets: 3, reps: 8, rpe: 7, rest_seconds: 60, mass_note: "bodyweight" }),
    ],
  };
}

function lowerA(): PlanDraft {
  return {
    title: SLOT_LABELS.lower_a,
    focus: "Power + lower strength",
    day_type: "lower_a",
    rationale:
      "Jump quality first, then submaximal strength. The jumps stay low-volume so the sprint session keeps its quality.",
    warnings: ["No sprint runway — keep any sprint work in place or band-resisted.", "Stop jumping when the landings get loud."],
    duration_min: 50,
    notes: null,
    exercises: [
      ...lowerWarmup(),
      ex({ name: "Box jump", block: "jump", sets: 3, reps: 5, mass_note: "30–40 cm", rpe: 6, rest_seconds: 90 }),
      ex({ name: "Broad jump", block: "jump", sets: 3, reps: 3, mass_note: "bodyweight", rpe: 6, rest_seconds: 90 }),
      ex({
        name: "Reverse lunge",
        block: "main",
        sets: 4,
        reps: 6,
        mass_kg: 22.5,
        rpe: 7,
        rest_seconds: 150,
        notes: "Each side. Total load stays at 22.5 kg while the squat is untested.",
      }),
      ex({ name: "RDL", block: "main", sets: 3, reps: 6, mass_kg: 55, rpe: 7, rest_seconds: 150 }),
      ex({ name: "Split squat", block: "main", sets: 2, reps: 8, mass_kg: 20, rpe: 7, rest_seconds: 90, notes: "Each side." }),
      ex({ name: "Ab wheel", block: "accessory", sets: 3, reps: 8, rpe: 7, rest_seconds: 60 }),
    ],
  };
}

function lowerB(context: VaultContext, deload: boolean): PlanDraft {
  const next = context.next_sessions.lower_b;
  if (!deload) {
    return {
      title: SLOT_LABELS.lower_b,
      focus: "Low jump + posterior chain",
      day_type: "lower_b",
      rationale: "Second lower-body strength day: low jumps, heavier Zercher, RDL. This is the heavy-ish leg day of the week.",
      warnings: ["Stop the set if your back rounds, not just if it is slow."],
      duration_min: 45,
      notes: null,
      exercises: [
        ...lowerWarmup(),
        ex({ name: "Landing drill", block: "jump", sets: 3, reps: 3, mass_note: "drop 30 cm, stick 3 s", rpe: 5, rest_seconds: 60 }),
        ex({ name: "Pogo", block: "jump", sets: 3, reps: 10, mass_note: "bodyweight", rpe: 6, rest_seconds: 60 }),
        ex({
          name: "Zercher squat",
          block: "main",
          sets: 4,
          reps: 5,
          mass_kg: 50,
          rpe: 8,
          rest_seconds: 180,
          notes: "77% of 65. Ramp bar×5 → 30×5 → 40×3 → 47.5×2 → 50.",
        }),
        ex({ name: "RDL", block: "main", sets: 3, reps: 4, mass_kg: 60, rpe: 8, rest_seconds: 150 }),
        ex({ name: "Leg curl (band)", block: "accessory", sets: 3, reps: 8, rpe: 8, rest_seconds: 60 }),
        ex({ name: "Chest-supported row", block: "accessory", sets: 3, reps: 8, rpe: 8, rest_seconds: 90 }),
      ],
    };
  }
  return {
    title: `${SLOT_LABELS.lower_b} · Deload`,
    focus: "Low jump + posterior chain",
    day_type: "lower_b",
    rationale:
      "Lower body is in its deload + retest week (23–29 Nov). Keep the pattern, cut the sets, and leave room for the retest.",
    warnings: ["Deload week — stop 2 reps short of anything grindy.", "No sprint runway — in-place work only."],
    duration_min: 40,
    notes: null,
    exercises: [
      ...lowerWarmup().slice(0, 5),
      ex({ name: "Landing drill", block: "jump", sets: 2, reps: 3, mass_note: "drop 30 cm, stick 3 s", rpe: 5, rest_seconds: 60 }),
      ex({ name: "Pogo", block: "jump", sets: 2, reps: 10, mass_note: "bodyweight", rpe: 5, rest_seconds: 60 }),
      ex({
        name: "Zercher squat",
        block: "main",
        sets: next.sets,
        reps: next.reps,
        mass_kg: next.mass_kg,
        rpe: 7,
        rest_seconds: 180,
        notes: "72% of 65. Ramp bar×5 → 30×5 → 40×3 → 47.5.",
      }),
      ex({ name: "RDL", block: "main", sets: 2, reps: 6, mass_kg: 55, rpe: 6, rest_seconds: 120 }),
      ex({ name: "Leg curl (band)", block: "accessory", sets: 2, reps: 8, rpe: 7, rest_seconds: 60 }),
      ex({ name: "Chest-supported row", block: "accessory", sets: 2, reps: 8, rpe: 7, rest_seconds: 60 }),
      ex({ name: "Couch stretch", block: "cooldown", sets: 1, hold_seconds: 30, rest_seconds: 0, rpe: 3, notes: "Each side." }),
      ex({ name: "Hamstring stretch", block: "cooldown", sets: 1, hold_seconds: 30, rest_seconds: 0, rpe: 3, notes: "Each side." }),
    ],
  };
}

function conditioning(): PlanDraft {
  return {
    title: SLOT_LABELS.conditioning,
    focus: "Aerobic recovery",
    day_type: "conditioning",
    rationale: "Zone 2 is recovery, not training. Keep it conversational and finish with mobility.",
    warnings: ["Nasal breathing if possible; if you cannot hold a conversation, slow down."],
    duration_min: 40,
    notes: null,
    exercises: [
      ex({ name: "Bike or rower", block: "conditioning", sets: 1, hold_seconds: 1800, rest_seconds: 0, rpe: 5, notes: "30 min at conversational pace." }),
      ex({ name: "Mobility flow", block: "cooldown", sets: 1, hold_seconds: 600, rest_seconds: 0, rpe: 3, notes: "Hips, ankles, thoracic spine." }),
    ],
  };
}

function rest(): PlanDraft {
  return {
    title: SLOT_LABELS.rest,
    focus: "Recovery",
    day_type: "rest",
    rationale: "Rest day. Walk, stretch, eat protein, sleep. No loading — the next press session is where the work happens.",
    warnings: [],
    duration_min: 0,
    notes: "Optional: 10–15 min easy walk + 5 min breathing.",
    exercises: [],
  };
}

export function buildProgramPlan(input: {
  date: string;
  slot: ConcreteSlot;
  context: VaultContext;
}): PlanDraft {
  const { date, slot, context } = input;
  switch (slot) {
    case "press_heavy":
      return pressHeavy(context, isPressDeload(date));
    case "press_volume":
      return pressVolume(context);
    case "press_speed":
      return pressSpeed(context);
    case "lower_a":
      return lowerA();
    case "lower_b":
      return lowerB(context, isLowerDeload(date));
    case "conditioning":
      return conditioning();
    case "rest":
      return rest();
  }
}