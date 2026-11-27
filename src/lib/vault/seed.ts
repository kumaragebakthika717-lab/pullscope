import type { VaultContext } from "./types";

export const SEED_EXPORTED_AT = "2026-11-27T15:21:17.816Z";

/**
 * Distilled from the "Ultimate Strength Vault" chat and its program files.
 * This is the fallback context until a fresh chat export is imported.
 */
export const SEED_CONTEXT: VaultContext = {
  units: "kg",
  athlete: {
    bodyweight_kg: 67,
    height_cm: 175,
    note: "Cutting slowly toward ~62 kg at 10–11% body fat while keeping the press climbing.",
  },
  goals: [
    {
      lift: "Seated military press",
      target_kg: 100,
      by: "2027-12-31",
      note: "Live goal. Start: 40 kg tested Nov 2026. Needs ~6.8%/month, decaying.",
    },
    {
      lift: "Zercher squat",
      target_kg: 140,
      by: "2027-12-31",
      note: "From 65 kg. 120 kg is the honest checkpoint; 140 is the stretch.",
    },
    { lift: "RDL", target_kg: 145, by: "2027-12-31", note: "Start: 78 kg tested with good form." },
    {
      lift: "Back squat",
      target_kg: 170,
      by: "2027-12-31",
      note: "Untested. Currently swapped for reverse lunges.",
    },
    { lift: "Pocket pull (single hand)", target_kg: 60, by: "2027-12-31" },
    {
      lift: "Physique",
      target_kg: 62,
      by: "no fixed date",
      note: "~10–11% body fat, visible abs, vascular arms; keep strength while cutting.",
    },
  ],
  current_block: {
    name: "Block 1 — Technique + volume",
    starts: "2026-11-09",
    ends: "2026-12-06",
    press_frequency: "3 press sessions/week (heavy, volume, speed), 14–18 press sets/week",
    notes: [
      "Press ladder: 45 kg e1RM by 29 Nov (38.5×5), 52.5 by 31 Jan 2027, 100 by 31 Dec 2027.",
      "Lower-body month 1 (3–29 Nov) prioritises sprint → jump → endurance → strength.",
      "Lower body is in a deload + retest week 23–29 Nov 2026.",
      "Deload + press retest lands 30 Nov – 6 Dec 2026.",
    ],
  },
  schedule: [
    { day: "Mon", session: "Sprint A + core", press: "Press A — heavy" },
    { day: "Tue", session: "Jump + Strength A", press: null },
    { day: "Wed", session: "Zone 2, 30 min", press: null },
    { day: "Thu", session: "Sprint B + muscular endurance", press: "Press B — volume" },
    { day: "Fri", session: "Jump (low) + Strength B", press: null },
    { day: "Sat", session: "Tempo 20 min", press: "Press C — speed" },
    { day: "Sun", session: "Rest", press: null },
  ],
  latest_tests: [
    { lift: "Seated press", kg: 40, date: "2026-11-01", note: "1RM start point for the 100 kg plan." },
    { lift: "Zercher squat", kg: 65, date: "2026-11-24", note: "Corrected max; 65 was mistakenly prescribed as 77%." },
    { lift: "RDL", kg: 78, date: "2026-11-01", note: "Tested with very good form." },
    { lift: "Reverse lunge", kg: 28.5, date: "2026-11-01", note: "Total load." },
  ],
  next_sessions: {
    press_heavy: {
      label: "Press A · Heavy",
      sets: 4,
      reps: 5,
      mass_kg: 32.5,
      rpe: 8,
      note: "Session 4 did 30 kg for 4×5. Move to 32.5 only if every set was RPE ≤8 with a clean path.",
    },
    press_volume: {
      label: "Press B · Volume",
      sets: 5,
      reps: 5,
      mass_kg: 30,
      rpe: 8,
      note: "Next press session after session 4. Repeat 30 kg until all five sets sit at RPE ≤8.",
    },
    press_speed: {
      label: "Press C · Speed",
      sets: 6,
      reps: 3,
      mass_kg: 27.5,
      rpe: 7,
      note: "2 s pause at the chin. Speed before grind; stop if bar speed drops.",
    },
    lower_a: {
      label: "Jump + Strength A",
      sets: 3,
      reps: 5,
      mass_kg: 47.5,
      rpe: 8,
      note: "Zercher 3×5 @47.5 (72% of 65). RDL 3×6 @55. Reverse lunge 4×6/side @22.5.",
    },
    lower_b: {
      label: "Jump (low) + Strength B",
      sets: 3,
      reps: 5,
      mass_kg: 47.5,
      rpe: 8,
      note: "Deload week: Zercher 3×5 @47.5, RDL 2×6 @55, jump volume low.",
    },
  },
  loads: [
    { lift: "Seated press", kg: 30, note: "Next volume 5×5; heavy day 32.5." },
    { lift: "Zercher", kg: 47.5, note: "72% of 65; 50 kg is 77%." },
    { lift: "RDL", kg: 55, note: "70% of 78." },
    { lift: "Reverse lunge", kg: 22.5, note: "Total load." },
    { lift: "Seated DB press", kg: 12, note: "12–14 kg per hand." },
    { lift: "Lateral raise", kg: 6, note: "6–8 kg DBs." },
  ],
  equipment: [
    "Barbell + plates (Zercher 65 kg and RDL 78 kg are tested)",
    "Seated press station / bench with safeties",
    "Adjustable dumbbells (6–14 kg per hand in the current plan)",
    "Resistance bands (pull-aparts, face pulls, leg curls)",
    "Box or stairs for jumps and landing drills",
    "Bike for zone 2 and warm-ups",
    "Ab wheel",
  ],
  limitations: [
    "Trains at home with no sprint runway — sprint work must be in place or band-resisted.",
    "Back squat is untested; the reverse lunge (28.5 kg total) is the current lower-body lift.",
    "Press is weak above the forehead — buy triceps and upper back, not extra pressing.",
    "No current injury reported. Do not exceed the 18 press sets/week cap.",
    "Lower body is deloading and retesting 23–29 Nov 2026 — keep leg loads submaximal.",
  ],
  recent_sessions: [
    { date: "2026-11-03", session: "Leg 1 — Strength A", done: "Box jump 3×5, lunge 4×6 @22.5, RDL 3×6 @55." },
    { date: "2026-11-09", session: "Press 1 — test", done: "5RM test, then back-off 3×5 @27.5." },
    { date: "2026-11-10", session: "Leg 2 — Jump + Strength A", done: "Box/broad jumps, lunge, RDL, split squat." },
    { date: "2026-11-12", session: "Press 2 — volume", done: "5×5 @27.5, DB press, pushdown, row." },
    { date: "2026-11-14", session: "Press 3 — speed", done: "6×3 @25 paused, close-grip bench, face pull." },
    { date: "2026-11-17", session: "Leg 3 — Jump + Strength A", done: "Jump block + lunge/RDL strength block." },
    { date: "2026-11-20", session: "Leg 4 — Jump low + Strength B", done: "Zercher 4×5 @50, RDL 3×4 @60, leg curl, row." },
    { date: "2026-11-26", session: "Press 4 — heavy", done: "Seated press 4×5 @30 + 2×5 @27.5, close-grip bench, lateral raise, row." },
  ],
  progress: {
    press_sessions_done: 4,
    leg_sessions_done: 4,
    note: "Next press session is Press B volume 5×5 @30. Leg day 4 is done; lower body is in its deload/test week.",
  },
  source: {
    chat: "Ultimate Strength Vault",
    exported_at: SEED_EXPORTED_AT,
    files: ["PRESS-100KG-PLAN.md", "MONTH-1-athletic.md", "LOWER-BODY-ATHLETIC-PROGRAM-2027.md"],
  },
};

/**
 * Real excerpts from the most recent part of the vault thread. The full export can
 * be imported from the Vault page; this keeps first-use generation grounded.
 */
export const SEED_TRANSCRIPT_TAIL = `### **You**
i dont have space to sprint since i train the house how can i get a similar effect by sprinting in place teach me a way

### **Assistant**
In-place sprinting is a drill, not a substitute for max-velocity output — but it can hold the pattern and the conditioning while you have no runway. Use short, sharp efforts: wall drill 2×10 s, A-march 2×20 m, pogo 3×10, then 4–6×10 s in-place sprints with full rest. Stop the set when the cadence drops.

### **You**
MY ZERCHER MAX IS 65KG

### **Assistant**
Zercher 65 kg changes the Friday session — 65 was 77% of an assumed 85–90, so the prescription was literally your 1RM for four sets of five. Re-baselining now.

72% of 65 = 47.5 kg · 77% = 50 kg · 80% = 52.5 kg

| Exercise | Sets × reps | Load | RPE | Rest |
|---|---|---|---|---|
| Zercher squat | 4×5 | 50 kg | 8 | 3 min |
| RDL | 3×4 | 60 kg | 8 | 2–3 min |
| Leg curl | 3×8 | RPE 8 | 8 | 60 s |
| Chest-supported row | 3×8 | RPE 7–8 | 8 | 90 s |

Nov 26 – Jan 31 block: Zercher 3×5 @47.5 (72%). Week 3 of any later block: 4×5 at 77% of the then-current max.

### **You**
now give me the 4th pressing workout we already did 3

### **Assistant**
# Press A · Heavy — press session 4 of the block

Fourth press workout; first of Week 2. Heavy day: fewer sets, more load. The volume day (session 2) did 27.5 for 5×5; today is 30 kg for 4×5 plus a short back-off.

| Exercise | Sets × reps | Load | RPE | Rest |
|---|---|---|---|---|
| Seated press | 4×5 | 30 kg | 7–8 | 3 min |
| Seated press back-off | 2×5 | 27.5 kg | 7 | 2–3 min |
| Close-grip bench | 3×6 | RPE 8 | 8 | 90 s |
| Lateral raise | 3×12 | 6–8 kg DBs | 7 | 60 s |
| Chest-supported row | 3×10 | RPE 7 | 7 | 60 s |

Progress decision after this session: if all four sets at 30 kg finished at RPE ≤8 with a clean path, next heavy day goes to 32.5 kg. If any set hit a 9, repeat 30.

Next press session: Volume, Week 2 — 5×5 @30 kg (RPE 8), DB press 3×8 @12–14, pushdown 3×12, face pull 3×15.`;

export function seedContext(): { context: VaultContext; tail: string } {
  return { context: SEED_CONTEXT, tail: SEED_TRANSCRIPT_TAIL };
}