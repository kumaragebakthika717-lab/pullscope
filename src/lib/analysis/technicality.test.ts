import { describe, expect, it } from "vitest";
import {
  ATTRIBUTES,
  FAMILY_ATTRIBUTES,
  MECHANICS_SIZE,
  CRAFT_SIZE,
  scoreTechnicality,
  tierFor,
  type InputRow,
} from "./technicality";
import { parseTechnicalityInput, parseRatingToken } from "./technicality-input";
import { EXAMPLE_TECHNICALITY_INPUT } from "./technicality-example";

function scoreByPuller(input: string) {
  const parsed = parseTechnicalityInput(input);
  const result = scoreTechnicality(parsed.rows, parsed.warnings, parsed.errors);
  return { parsed, result, byName: new Map(result.scores.map((score) => [score.puller, score])) };
}

describe("technicality model", () => {
  it("has the blueprint's 19 attributes split 6/6/4/3", () => {
    expect(ATTRIBUTES).toHaveLength(19);
    expect(FAMILY_ATTRIBUTES.A).toHaveLength(6);
    expect(FAMILY_ATTRIBUTES.B).toHaveLength(6);
    expect(FAMILY_ATTRIBUTES.C).toHaveLength(4);
    expect(FAMILY_ATTRIBUTES.D).toHaveLength(3);
    expect(MECHANICS_SIZE).toBe(12);
    expect(CRAFT_SIZE).toBe(7);
  });

  it("maps TI to the blueprint's presentation bands, not S/A/B/C/D cutoffs", () => {
    expect(tierFor(85).letter).toBe("S");
    expect(tierFor(84.9).letter).toBe("A");
    expect(tierFor(70).letter).toBe("A");
    expect(tierFor(69.9).letter).toBe("B");
    expect(tierFor(55).letter).toBe("B");
    expect(tierFor(54.9).letter).toBe("C");
    expect(tierFor(40).letter).toBe("C");
    expect(tierFor(39.9).letter).toBe("D");
  });

  it("parses rating tokens and keeps black distinct from blank", () => {
    expect(parseRatingToken("G")).toBe(1);
    expect(parseRatingToken("good")).toBe(1);
    expect(parseRatingToken("B")).toBe(0);
    expect(parseRatingToken("neutral")).toBe(0);
    expect(parseRatingToken("R")).toBe(-1);
    expect(parseRatingToken("bad")).toBe(-1);
    expect(parseRatingToken("")).toBeNull();
    expect(parseRatingToken("-")).toBeNull();
    expect(parseRatingToken("wat")).toBeUndefined();
  });
});

describe("technicality parser", () => {
  it("parses a JSON array and a delimited table", () => {
    const json = parseTechnicalityInput(
      JSON.stringify([
        { puller: "Oleg", match: "M1", ratings: { Fingers: "G", "Depth (pronator)": "R", Palm: "B" } },
      ]),
    );
    expect(json.errors).toEqual([]);
    expect(json.rows).toHaveLength(1);
    expect(json.rows[0].ratings).toEqual({ fingers: 1, depth: -1, palm: 0 });

    const table = parseTechnicalityInput(
      "puller,match,Fingers,Depth (pronator),Palm\nOleg,EVW26,G,,B\n",
    );
    expect(table.errors).toEqual([]);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].ratings).toEqual({ fingers: 1, palm: 0 });
  });

  it("accepts a puller-keyed JSON object and top-level attribute keys", () => {
    const parsed = parseTechnicalityInput(
      JSON.stringify({
        Oleg: { match: "M1", Fingers: "G", Riser: "R" },
      }),
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].puller).toBe("Oleg");
    expect(parsed.rows[0].ratings).toEqual({ fingers: 1, riser: -1 });
  });

  it("warns on the unresolved 20th strap attribute and ignores it", () => {
    const parsed = parseTechnicalityInput(
      JSON.stringify([{ puller: "Ongar", match: "EVW7", ratings: { Fingers: "G", strap: "G" } }]),
    );
    expect(parsed.rows[0].ratings).toEqual({ fingers: 1 });
    expect(parsed.warnings.join(" ")).toContain("unresolved 20th attribute");
  });

  it("merges duplicate puller/match rows with the later value winning", () => {
    const parsed = parseTechnicalityInput(
      JSON.stringify([
        { puller: "Oleg", match: "M1", ratings: { Fingers: "G" } },
        { puller: "Oleg", match: "M1", ratings: { Fingers: "R", Riser: "G" } },
      ]),
    );
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].ratings).toEqual({ fingers: -1, riser: 1 });
    expect(parsed.warnings.join(" ")).toContain("Duplicate row");
  });

  it("reports missing puller/attribute columns instead of guessing", () => {
    const noPuller = parseTechnicalityInput("nameX,Fingers\nOleg,G\n");
    expect(noPuller.errors.join(" ")).toContain('"puller"');
    const noAttributes = parseTechnicalityInput("puller,notes\nOleg,hello\n");
    expect(noAttributes.errors.join(" ")).toContain("attribute columns");
  });
});

describe("technicality scoring against the blueprint", () => {
  it("reproduces the single-card numbers", () => {
    const { byName } = scoreByPuller(EXAMPLE_TECHNICALITY_INPUT);

    const oleg = byName.get("Oleg")!;
    expect(oleg.n).toBe(13);
    expect(oleg.M).toBeCloseTo(0.3333, 4);
    expect(oleg.K).toBeCloseTo(0, 4);
    expect(oleg.T).toBeCloseTo(0.2333, 4);
    expect(oleg.r).toBeCloseTo(0.5652, 4);
    expect(oleg.TI).toBeCloseTo(56.59, 1);
    expect(oleg.tier?.letter).toBe("B");

    const arthur = byName.get("Arthur")!;
    expect(arthur.n).toBe(14);
    expect(arthur.M).toBeCloseTo(0.0833, 4);
    expect(arthur.K).toBeCloseTo(0.4286, 4);
    expect(arthur.TI).toBeCloseTo(55.45, 1);

    const janis = byName.get("Janis")!;
    expect(janis.n).toBe(6);
    expect(janis.coverage).toBeCloseTo(6 / 19, 4);
    expect(janis.TI).toBeCloseTo(52.99, 1);
    expect(janis.tier?.letter).toBe("C");

    const craig = byName.get("Craig")!;
    expect(craig.n).toBe(0);
    expect(craig.TI).toBeNull();
    expect(craig.tier).toBeNull();
    expect(craig.status).toBe("unrated");
  });

  it("aggregates Vitaly's two matches and computes the wide t-band", () => {
    const { byName } = scoreByPuller(EXAMPLE_TECHNICALITY_INPUT);
    const vitaly = byName.get("Vitaly Laletin")!;
    expect(vitaly.matches).toBe(2);
    expect(vitaly.n).toBe(22);
    expect(vitaly.coverage).toBeCloseTo(16 / 19, 4);
    expect(vitaly.M).toBeCloseTo(-0.0833, 4);
    expect(vitaly.K).toBeCloseTo(0.4286, 4);
    expect(vitaly.TI).toBeCloseTo(52.41, 1);
    expect(vitaly.band).not.toBeNull();
    expect(vitaly.band!.usedMatches).toBe(2);
    expect(vitaly.band!.critical).toBeCloseTo(12.706, 2);
    expect(vitaly.band!.halfWidth).toBeGreaterThan(130);
  });

  it("orders the eight rated pullers exactly as the blueprint does", () => {
    const { result } = scoreByPuller(EXAMPLE_TECHNICALITY_INPUT);
    expect(result.scored.map((score) => score.puller)).toEqual([
      "Kydyrgali Ongarbayev",
      "Devon Larratt",
      "Ermes Gasparini",
      "Oleg",
      "Arthur",
      "Janis",
      "Vitaly Laletin",
      "Irakli Zirakashvili",
    ]);
    expect(result.scored.map((score) => Number(score.TI!.toFixed(1)))).toEqual([
      63.4, 62.9, 58.0, 56.6, 55.5, 53.0, 52.4, 49.1,
    ]);
    expect(result.unrated.map((score) => score.puller)).toEqual(["Craig"]);
    expect(result.stats).toMatchObject({ pullers: 9, scored: 8, unrated: 1, ranked: 0 });
  });

  it("never turns an all-blank card into a neutral 50", () => {
    const parsed = parseTechnicalityInput(
      JSON.stringify([{ puller: "Ghost", match: "M1", ratings: {} }]),
    );
    const result = scoreTechnicality(parsed.rows);
    expect(result.scores[0].TI).toBeNull();
    expect(result.scores[0].status).toBe("unrated");
  });

  it("counts an explicit black as evidence, unlike a blank", () => {
    const parsed = parseTechnicalityInput(
      JSON.stringify([{ puller: "BlackOnly", match: "M1", ratings: { Fingers: "B" } }]),
    );
    const score = scoreTechnicality(parsed.rows).scores[0];
    expect(score.n).toBe(1);
    expect(score.status).toBe("provisional");
    expect(score.TI).toBeNull();
    expect(score.mechDisplay).toBe(50);
    expect(score.thin).toBe(true);
    expect(score.flags).toContain("No craft verdicts");
  });

  it("only marks a profile ranked after the full gate is cleared", () => {
    const mechanics = FAMILY_ATTRIBUTES.A.slice(0, 5)
      .concat(FAMILY_ATTRIBUTES.B.slice(0, 4))
      .map((attribute) => [attribute.label, "G"] as const);
    const craft = FAMILY_ATTRIBUTES.C.concat(FAMILY_ATTRIBUTES.D.slice(0, 2)).map(
      (attribute) => [attribute.label, "G"] as const,
    );
    const ratings = Object.fromEntries([...mechanics, ...craft]);
    // 15 distinct attributes, repeated over 3 matches: 45 verdicts, 78.9% coverage.
    const rows: InputRow[] = [1, 2, 3].map((match) => ({
      puller: "Complete",
      match: `M${match}`,
      ratings: parseTechnicalityInput(
        JSON.stringify([{ puller: "Complete", match: `M${match}`, ratings }]),
      ).rows[0].ratings,
    }));
    const score = scoreTechnicality(rows).scores[0];
    expect(score.coverage).toBeCloseTo(15 / 19, 4);
    expect(score.n).toBe(45);
    expect(score.status).toBe("ranked");
    expect(score.tier?.letter).toBe("A");
    expect(score.TI).toBeCloseTo(82, 0);
  });

  it("flags missing data and below-gate coverage", () => {
    const { byName } = scoreByPuller(EXAMPLE_TECHNICALITY_INPUT);
    const janis = byName.get("Janis")!;
    expect(janis.missing).toContain("Fingers");
    expect(janis.thin).toBe(true);
    expect(janis.flags).toContain("Below formal provisional gate");
    expect(janis.justification).toContain("Blank / not evidence");
  });
});