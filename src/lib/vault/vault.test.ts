import { describe, expect, it } from "vitest";
import { aiPlanSchema } from "@/lib/vault/schemas";
import { SEED_CONTEXT } from "@/lib/vault/seed";
import { autoSlot, buildProgramPlan, isLowerDeload, isPressDeload, resolveSlot } from "@/lib/vault/program";
import { parseVaultTranscript } from "@/lib/vault/transcript";

describe("autoSlot", () => {
  it("follows the vault weekday template", () => {
    expect(autoSlot("2026-11-27")).toBe("lower_b"); // Friday
    expect(autoSlot("2026-11-28")).toBe("press_speed"); // Saturday
    expect(autoSlot("2026-11-29")).toBe("rest"); // Sunday
    expect(autoSlot("2026-11-30")).toBe("press_heavy"); // Monday
    expect(autoSlot("2026-12-01")).toBe("lower_a"); // Tuesday
  });

  it("respects an explicit override", () => {
    expect(resolveSlot("lower_a", "2026-11-27")).toBe("lower_a");
    expect(resolveSlot("auto", "2026-11-27")).toBe("lower_b");
  });
});

describe("deload windows", () => {
  it("marks the lower-body deload 23-29 Nov only", () => {
    expect(isLowerDeload("2026-11-22")).toBe(false);
    expect(isLowerDeload("2026-11-23")).toBe(true);
    expect(isLowerDeload("2026-11-29")).toBe(true);
    expect(isLowerDeload("2026-11-30")).toBe(false);
  });

  it("marks the press deload 30 Nov - 6 Dec only", () => {
    expect(isPressDeload("2026-11-29")).toBe(false);
    expect(isPressDeload("2026-11-30")).toBe(true);
    expect(isPressDeload("2026-12-06")).toBe(true);
    expect(isPressDeload("2026-12-07")).toBe(false);
  });
});

describe("buildProgramPlan", () => {
  it("prescribes the seeded heavy press load with RPE and rest", () => {
    const plan = buildProgramPlan({ date: "2026-12-07", slot: "press_heavy", context: SEED_CONTEXT });
    const press = plan.exercises.find((e) => e.name === "Seated press");
    expect(press).toBeDefined();
    expect(press?.sets).toBe(SEED_CONTEXT.next_sessions.press_heavy.sets);
    expect(press?.mass_kg).toBe(SEED_CONTEXT.next_sessions.press_heavy.mass_kg);
    expect(press?.rpe).toBe(SEED_CONTEXT.next_sessions.press_heavy.rpe);
    expect(press?.rest_seconds).toBeGreaterThan(0);
  });

  it("cuts the press on the deload week", () => {
    const plan = buildProgramPlan({ date: "2026-12-02", slot: "press_heavy", context: SEED_CONTEXT });
    expect(plan.title).toContain("Deload");
    const press = plan.exercises.find((e) => e.name === "Seated press");
    expect(press?.sets).toBe(3);
    expect(press?.mass_kg).toBe(27.5);
  });

  it("uses the lower-body deload loads on 27 Nov", () => {
    const plan = buildProgramPlan({ date: "2026-11-27", slot: "lower_b", context: SEED_CONTEXT });
    expect(plan.title).toContain("Deload");
    const zercher = plan.exercises.find((e) => e.name === "Zercher squat");
    expect(zercher?.sets).toBe(SEED_CONTEXT.next_sessions.lower_b.sets);
    expect(zercher?.mass_kg).toBe(SEED_CONTEXT.next_sessions.lower_b.mass_kg);
  });

  it("returns an empty session on a rest day", () => {
    const plan = buildProgramPlan({ date: "2026-11-29", slot: "rest", context: SEED_CONTEXT });
    expect(plan.exercises).toHaveLength(0);
    expect(plan.day_type).toBe("rest");
  });

  it("keeps every loaded prescription explicit", () => {
    for (const slot of ["press_heavy", "press_volume", "press_speed", "lower_a", "lower_b"] as const) {
      const plan = buildProgramPlan({ date: "2026-11-24", slot, context: SEED_CONTEXT });
      const main = plan.exercises.filter((e) => e.block === "main");
      expect(main.length).toBeGreaterThan(0);
      for (const exercise of main) {
        const hasLoad = exercise.mass_kg !== null || exercise.mass_note !== null;
        expect(hasLoad).toBe(true);
        expect(exercise.intensity_type === "rpe" ? exercise.rpe !== null : true).toBe(true);
      }
    }
  });
});

describe("parseVaultTranscript", () => {
  const raw = `# Ultimate Strength Vault

**Exported:** 2026-11-27T15:21:17.816Z

### **You**
i dont have space to sprint since i train the house

### **Assistant**
Use in-place sprints: 4-6 x 10 s with full rest.

### **You**
MY ZERCHER MAX IS 65KG

### **Assistant**
Re-baselining the Friday session.

### **You**
now give me the 4th pressing workout we already did 3

### **Assistant**
# Press A · Heavy

| Exercise | Sets x reps | Load |
|---|---|---|
| Seated press | 4x5 | 30 kg |
`;

  it("splits the export into messages and keeps the recent tail", () => {
    const parsed = parseVaultTranscript(raw);
    expect(parsed.exportedAt).toBe("2026-11-27T15:21:17.816Z");
    expect(parsed.messages).toHaveLength(6);
    expect(parsed.cleanText).toContain("MY ZERCHER MAX IS 65KG");
    expect(parsed.tail).toContain("Seated press | 4x5");
    expect(parsed.facts.tests).toContainEqual({ lift: "Zercher squat", kg: 65 });
    expect(parsed.facts.pressSessionsDone).toBe(3);
    expect(parsed.facts.limitations.join(" ")).toMatch(/sprint/i);
  });

  it("handles a file with no recognised messages", () => {
    expect(parseVaultTranscript("just some text").messages).toHaveLength(0);
  });
});

describe("aiPlanSchema", () => {
  it("coerces string loads and keeps reps/holds exclusive", () => {
    const parsed = aiPlanSchema.safeParse({
      title: "Press A",
      focus: "Press strength",
      rationale: "Heavy day.",
      warnings: [],
      duration_min: "45",
      exercises: [
        {
          name: "Seated press",
          block: "main",
          sets: "4",
          mass_kg: "32.5 kg",
          reps: "5",
          hold_seconds: "",
          rest_seconds: "180 s",
          rpe: "8",
        },
        {
          name: "Plank",
          block: "accessory",
          sets: 2,
          hold_seconds: "30 s",
          reps: 0,
          intensity_type: "none",
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const [press, plank] = parsed.data.exercises;
    expect(press.sets).toBe(4);
    expect(press.mass_kg).toBe(32.5);
    expect(press.reps).toBe(5);
    expect(press.hold_seconds).toBeNull();
    expect(press.intensity_type).toBe("rpe");
    expect(press.rpe).toBe(8);
    expect(plank.hold_seconds).toBe(30);
    expect(plank.reps).toBeNull();
    expect(plank.intensity_type).toBe("none");
  });

  it("rejects a plan with no title", () => {
    const parsed = aiPlanSchema.safeParse({ title: "", exercises: [] });
    expect(parsed.success).toBe(false);
  });
});