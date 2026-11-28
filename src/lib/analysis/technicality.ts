export const MODEL_VERSION = "ti_v1.1-19";

export const MODEL = {
  mechanicsWeight: 0.7,
  craftWeight: 0.3,
  shrinkK: 10,
  ranked: { matches: 3, verdicts: 24, coverage: 0.75 },
  provisional: { matches: 1, verdicts: 8, coverage: 0.5 },
} as const;

export const ATTRIBUTE_IDS = [
  "fingers",
  "depth",
  "palm",
  "wrist",
  "riser",
  "clamping",
  "turn",
  "optimal-vector",
  "shoulder-line",
  "elbow",
  "center",
  "frame-lock",
  "strategic-fouling",
  "refs-grip",
  "initial-grip",
  "talking-to-ref",
  "versatility",
  "counter-style",
  "out-of-strap",
] as const;

export type AttributeId = (typeof ATTRIBUTE_IDS)[number];
export type Family = "A" | "B" | "C" | "D";

export interface AttributeDef {
  id: AttributeId;
  label: string;
  family: Family;
  aliases: readonly string[];
}

export const FAMILY_LABELS: Record<Family, string> = {
  A: "Connection",
  B: "Force delivery",
  C: "Setup & rule interface",
  D: "Adaptation",
};

// Display order follows the blueprint's 19-attribute verdict sheet.
export const ATTRIBUTES: readonly AttributeDef[] = [
  { id: "fingers", label: "Fingers", family: "A", aliases: ["finger"] },
  { id: "depth", label: "Depth (pronator)", family: "A", aliases: ["depth", "depth pronator", "pronator"] },
  { id: "palm", label: "Palm", family: "A", aliases: [] },
  { id: "wrist", label: "Wrist", family: "A", aliases: [] },
  { id: "riser", label: "Riser", family: "A", aliases: [] },
  { id: "clamping", label: "Clamping", family: "A", aliases: ["clamp"] },
  { id: "turn", label: "The turn", family: "B", aliases: ["turn"] },
  {
    id: "optimal-vector",
    label: "Optimal vector application",
    family: "B",
    aliases: ["optimal vector", "vector", "optimal vector application"],
  },
  { id: "shoulder-line", label: "Shoulder line", family: "B", aliases: ["shoulder"] },
  { id: "elbow", label: "Elbow positioning", family: "B", aliases: ["elbow position"] },
  { id: "center", label: "Center", family: "B", aliases: ["centre"] },
  { id: "frame-lock", label: "Frame lock", family: "B", aliases: ["frame"] },
  { id: "strategic-fouling", label: "Strategic fouling", family: "C", aliases: ["fouling"] },
  { id: "refs-grip", label: "Ref's grip", family: "C", aliases: ["ref grip", "refs grip", "referee grip", "referees grip"] },
  { id: "initial-grip", label: "Initial grip", family: "C", aliases: ["setup grip"] },
  {
    id: "talking-to-ref",
    label: "Talking to the ref",
    family: "C",
    aliases: ["talking to ref", "talking to referee", "talking to the referee", "talking"],
  },
  { id: "versatility", label: "Versatility", family: "D", aliases: [] },
  { id: "counter-style", label: "Counter style", family: "D", aliases: ["counter"] },
  { id: "out-of-strap", label: "Out of strap", family: "D", aliases: ["out of straps"] },
];

export const FAMILY_ATTRIBUTES: Record<Family, readonly AttributeDef[]> = {
  A: ATTRIBUTES.filter((attribute) => attribute.family === "A"),
  B: ATTRIBUTES.filter((attribute) => attribute.family === "B"),
  C: ATTRIBUTES.filter((attribute) => attribute.family === "C"),
  D: ATTRIBUTES.filter((attribute) => attribute.family === "D"),
};

export const FAMILY_SIZE: Record<Family, number> = {
  A: FAMILY_ATTRIBUTES.A.length,
  B: FAMILY_ATTRIBUTES.B.length,
  C: FAMILY_ATTRIBUTES.C.length,
  D: FAMILY_ATTRIBUTES.D.length,
};

export const MECHANICS_SIZE = FAMILY_SIZE.A + FAMILY_SIZE.B;
export const CRAFT_SIZE = FAMILY_SIZE.C + FAMILY_SIZE.D;

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u2018\u2019']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const ALIAS_LOOKUP = new Map<string, AttributeDef>();
for (const attribute of ATTRIBUTES) {
  ALIAS_LOOKUP.set(normalizeName(attribute.id), attribute);
  ALIAS_LOOKUP.set(normalizeName(attribute.label), attribute);
  for (const alias of attribute.aliases) ALIAS_LOOKUP.set(normalizeName(alias), attribute);
}

export function findAttribute(column: string): AttributeDef | null {
  return ALIAS_LOOKUP.get(normalizeName(column)) ?? null;
}

export interface InputRow {
  puller: string;
  match: string;
  /** Only rated attributes are present. A black verdict is an explicit 0. */
  ratings: Partial<Record<AttributeId, number>>;
}

export interface AttributeScore {
  attribute: AttributeDef;
  perMatch: { match: string; value: number }[];
  values: number[];
  rated: number;
  score: number;
}

export interface FamilyScore {
  family: Family;
  label: string;
  size: number;
  sum: number;
  rated: number;
  mean: number;
}

export interface ConfidenceBand {
  halfWidth: number;
  low: number;
  high: number;
  se: number;
  usedMatches: number;
  critical: number;
}

export interface TierDef {
  letter: "S" | "A" | "B" | "C" | "D";
  name: string;
  min: number;
  range: string;
}

// The blueprint defines these as presentation bands, not validated cutoffs.
export const TIER_BANDS: readonly TierDef[] = [
  { letter: "S", name: "Elite technician", min: 85, range: "85–100" },
  { letter: "A", name: "Strong", min: 70, range: "70–84.9" },
  { letter: "B", name: "Functional", min: 55, range: "55–69.9" },
  { letter: "C", name: "Developing", min: 40, range: "40–54.9" },
  { letter: "D", name: "Mechanical gaps", min: 0, range: "0–39.9" },
];

export function tierFor(ti: number): TierDef {
  const rounded = Math.round(ti * 10) / 10;
  return TIER_BANDS.find((tier) => rounded >= tier.min) ?? TIER_BANDS[TIER_BANDS.length - 1];
}

export interface PullerScore {
  puller: string;
  matches: number;
  n: number;
  coverage: number;
  explicitBlack: number;
  blackRate: number;
  attributes: AttributeScore[];
  families: Record<Family, FamilyScore>;
  M: number;
  K: number;
  T: number | null;
  r: number;
  TI: number | null;
  raw: number | null;
  mechDisplay: number | null;
  craftDisplay: number | null;
  tier: TierDef | null;
  status: "unrated" | "provisional" | "ranked";
  thin: boolean;
  hasMechanics: boolean;
  hasCraft: boolean;
  gate: { matches: boolean; verdicts: boolean; coverage: boolean; bothBlocks: boolean };
  band: ConfidenceBand | null;
  missing: string[];
  flags: string[];
  justification: string;
}

export interface TechnicalityResult {
  scores: PullerScore[];
  scored: PullerScore[];
  noIndex: PullerScore[];
  unrated: PullerScore[];
  warnings: string[];
  errors: string[];
  stats: {
    pullers: number;
    scored: number;
    unrated: number;
    ranked: number;
    provisional: number;
  };
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function signed(value: number, digits = 3): string {
  if (Math.abs(value) < 0.0005) return (0).toFixed(digits);
  return `${value > 0 ? "+" : "-"}${Math.abs(value).toFixed(digits)}`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function listLabels(labels: string[], limit = 3): string {
  if (labels.length <= limit) return labels.join(", ");
  return `${labels.slice(0, limit).join(", ")} and ${labels.length - limit} more`;
}

function tCritical(df: number): number {
  const table = [
    0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16,
    2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052,
    2.048, 2.045, 2.042,
  ];
  return df >= 1 && df < table.length ? table[df] : 1.96;
}

function mergeRowsByMatch(rows: InputRow[]): Map<string, InputRow> {
  const byMatch = new Map<string, InputRow>();
  for (const row of rows) {
    const key = normalizeName(row.match) || row.match;
    const existing = byMatch.get(key);
    if (!existing) {
      byMatch.set(key, { puller: row.puller, match: row.match, ratings: { ...row.ratings } });
      continue;
    }
    // One verdict per match per attribute: the later non-blank value wins.
    for (const [attribute, value] of Object.entries(row.ratings) as [AttributeId, number][]) {
      if (typeof value === "number") existing.ratings[attribute] = value;
    }
  }
  return byMatch;
}

function perMatchT(rows: InputRow[]): number | null {
  let mechanicsSum = 0;
  let mechanicsRated = 0;
  let craftSum = 0;
  let craftRated = 0;
  for (const attribute of ATTRIBUTES) {
    const value = rows[0]?.ratings[attribute.id];
    if (typeof value !== "number") continue;
    if (attribute.family === "A" || attribute.family === "B") {
      mechanicsSum += value;
      mechanicsRated += 1;
    } else {
      craftSum += value;
      craftRated += 1;
    }
  }
  if (mechanicsRated === 0 || craftRated === 0) return null;
  // Blanks sit in the family denominator as zeros, matching the 19-attribute chain.
  const mechanics = mechanicsSum / MECHANICS_SIZE;
  const craft = craftSum / CRAFT_SIZE;
  return MODEL.mechanicsWeight * mechanics + MODEL.craftWeight * craft;
}

function confidenceBand(matchRows: InputRow[], ti: number): ConfidenceBand | null {
  const values = matchRows.map((row) => perMatchT([row])).filter((value): value is number => value !== null);
  if (values.length < 2) return null;
  const center = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1);
  const sd = Math.sqrt(variance);
  const se = sd / Math.sqrt(values.length);
  const critical = tCritical(values.length - 1);
  const halfWidth = critical * 50 * se;
  return {
    halfWidth,
    low: ti - halfWidth,
    high: ti + halfWidth,
    se,
    usedMatches: values.length,
    critical,
  };
}

function buildJustification(score: PullerScore): string {
  if (score.n === 0) {
    return `${score.puller} has no rated attributes. Blank is not the same as a neutral verdict, so there is no TI and no tier. This profile is unrated, not a 50.`;
  }

  const tier = score.tier;
  if (score.TI === null || tier === null) {
    const missingBlock = !score.hasMechanics ? "mechanics" : "craft";
    return `${score.puller} has ${score.n} verdict${score.n === 1 ? "" : "s"} across ${score.matches} match${score.matches === 1 ? "" : "es"} but no ${missingBlock} evidence, so the composite T and TI cannot be computed. The blueprint requires both blocks; this profile is provisional without a technicality rank. Coverage is ${percent(score.coverage)}.`;
  }

  const parts: string[] = [
    `${score.puller} scores ${score.TI!.toFixed(1)} — ${tier.letter} / ${tier.name} (${tier.range}) — from ${score.n} verdict${score.n === 1 ? "" : "s"} across ${score.matches} match${score.matches === 1 ? "" : "es"} at ${percent(score.coverage)} attribute coverage.`,
  ];

  const positive = score.attributes
    .filter((attribute) => attribute.rated > 0 && attribute.score > 0.0005)
    .sort((a, b) => b.score - a.score || b.rated - a.rated);
  const negative = score.attributes
    .filter((attribute) => attribute.rated > 0 && attribute.score < -0.0005)
    .sort((a, b) => a.score - b.score || b.rated - a.rated);

  parts.push(
    positive.length
      ? `Net-positive: ${positive.slice(0, 2).map((attribute) => `${attribute.attribute.label} (${signed(attribute.score, 2)})`).join(", ")}.`
      : "No attribute is net-positive.",
  );
  parts.push(
    negative.length
      ? `Net-negative: ${negative.slice(0, 2).map((attribute) => `${attribute.attribute.label} (${signed(attribute.score, 2)})`).join(", ")}.`
      : "No attribute is net-negative.",
  );

  const gap = score.K - score.M;
  if (Math.abs(gap) < 0.12) {
    parts.push(
      `Mechanics (${signed(score.M, 2)}) and craft (${signed(score.K, 2)}) are close; neither block alone decides the tier.`,
    );
  } else if (gap > 0) {
    parts.push(
      `Craft (${signed(score.K, 2)}) is stronger than mechanics (${signed(score.M, 2)}), but craft carries only 30% of T, so it cannot rescue a mechanical deficit.`,
    );
  } else {
    parts.push(
      `Mechanics (${signed(score.M, 2)}) leads craft (${signed(score.K, 2)}); the 70% mechanics weight is doing the work.`,
    );
  }

  parts.push(
    score.missing.length
      ? `Blank / not evidence: ${listLabels(score.missing)}.`
      : "All 19 attributes are rated.",
  );

  if (score.thin) {
    parts.push(
      `Thin evidence: ${score.n} verdict${score.n === 1 ? "" : "s"} and ${percent(score.coverage)} coverage sit below the formal provisional gate (8 verdicts / 50%).`,
    );
  }
  if (score.band) {
    parts.push(
      `95% band ±${score.band.halfWidth.toFixed(1)} (${score.band.usedMatches} usable matches, t=${score.band.critical.toFixed(2)}).`,
    );
  } else if (score.matches <= 1) {
    parts.push("No 95% band: one match cannot produce between-match variance.");
  }

  return parts.join(" ");
}

function scorePuller(puller: string, rows: InputRow[]): PullerScore {
  const byMatch = mergeRowsByMatch(rows);
  const matchRows = [...byMatch.values()];
  const matches = matchRows.length;

  const attributes: AttributeScore[] = ATTRIBUTES.map((attribute) => {
    const perMatch = matchRows.flatMap((row) => {
      const value = row.ratings[attribute.id];
      return typeof value === "number" ? [{ match: row.match, value }] : [];
    });
    const values = perMatch.map((entry) => entry.value);
    return {
      attribute,
      perMatch,
      values,
      rated: values.length,
      score: values.length ? mean(values) : 0,
    };
  });

  const families = {} as Record<Family, FamilyScore>;
  for (const family of ["A", "B", "C", "D"] as const) {
    const members = attributes.filter((attribute) => attribute.attribute.family === family);
    const sum = members.reduce((total, attribute) => total + attribute.score, 0);
    families[family] = {
      family,
      label: FAMILY_LABELS[family],
      size: members.length,
      sum,
      rated: members.reduce((total, attribute) => total + attribute.rated, 0),
      mean: sum / members.length,
    };
  }

  const M = (families.A.sum + families.B.sum) / MECHANICS_SIZE;
  const K = (families.C.sum + families.D.sum) / CRAFT_SIZE;
  const n = attributes.reduce((total, attribute) => total + attribute.rated, 0);
  const coverage = attributes.filter((attribute) => attribute.rated > 0).length / ATTRIBUTES.length;
  const explicitBlack = attributes.reduce(
    (total, attribute) => total + attribute.perMatch.filter((entry) => entry.value === 0).length,
    0,
  );
  const blackRate = n ? explicitBlack / n : 0;
  const r = n / (n + MODEL.shrinkK);
  const hasMechanics = families.A.rated + families.B.rated > 0;
  const hasCraft = families.C.rated + families.D.rated > 0;
  const T = hasMechanics && hasCraft ? MODEL.mechanicsWeight * M + MODEL.craftWeight * K : null;
  const TI = T === null ? null : 50 + 50 * r * T;
  const gate = {
    matches: matches >= MODEL.ranked.matches,
    verdicts: n >= MODEL.ranked.verdicts,
    coverage: coverage >= MODEL.ranked.coverage,
    bothBlocks: hasMechanics && hasCraft,
  };
  const status: PullerScore["status"] =
    n === 0 ? "unrated" : gate.matches && gate.verdicts && gate.coverage && gate.bothBlocks ? "ranked" : "provisional";
  const tier = TI === null ? null : tierFor(TI);
  const thin = n > 0 && (n < MODEL.provisional.verdicts || coverage < MODEL.provisional.coverage);
  const missing = attributes.filter((attribute) => attribute.rated === 0).map((attribute) => attribute.attribute.label);

  const flags: string[] = [];
  if (n === 0) flags.push("No rated attributes");
  if (n > 0 && thin) flags.push("Below formal provisional gate");
  if (n > 0 && !hasMechanics) flags.push("No mechanics verdicts");
  if (n > 0 && !hasCraft) flags.push("No craft verdicts");
  if (blackRate > 0.4) flags.push("Black rate above 40%");
  if (n > 0 && coverage < MODEL.ranked.coverage) flags.push("Coverage below ranked gate");
  if (status === "ranked") flags.push("Ranked gate cleared");

  const score: PullerScore = {
    puller,
    matches,
    n,
    coverage,
    explicitBlack,
    blackRate,
    attributes,
    families,
    M,
    K,
    T,
    r,
    TI,
    raw: T === null ? null : 50 + 50 * T,
    mechDisplay: hasMechanics ? 50 + 50 * r * M : null,
    craftDisplay: hasCraft ? 50 + 50 * r * K : null,
    tier,
    status,
    thin,
    hasMechanics,
    hasCraft,
    gate,
    band: TI === null ? null : confidenceBand(matchRows, TI),
    missing,
    flags,
    justification: "",
  };
  score.justification = buildJustification(score);
  return score;
}

export function scoreTechnicality(rows: InputRow[], warnings: string[] = [], errors: string[] = []): TechnicalityResult {
  const groups = new Map<string, { display: string; rows: InputRow[] }>();
  for (const row of rows) {
    const key = normalizeName(row.puller);
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { display: row.puller.trim(), rows: [row] });
  }

  const scores = [...groups.values()].map((group) => scorePuller(group.display, group.rows));
  scores.sort((a, b) => {
    if (a.TI === null && b.TI === null) return a.puller.localeCompare(b.puller);
    if (a.TI === null) return 1;
    if (b.TI === null) return -1;
    if (Math.abs(b.TI - a.TI) > 1e-9) return b.TI - a.TI;
    if (Math.abs(b.coverage - a.coverage) > 1e-9) return b.coverage - a.coverage;
    if (Math.abs(b.M - a.M) > 1e-9) return b.M - a.M;
    return (a.band?.se ?? Number.POSITIVE_INFINITY) - (b.band?.se ?? Number.POSITIVE_INFINITY);
  });

  const scored = scores.filter((score) => score.TI !== null);
  const noIndex = scores.filter((score) => score.n > 0 && score.TI === null);
  const unrated = scores.filter((score) => score.n === 0);

  return {
    scores,
    scored,
    noIndex,
    unrated,
    warnings,
    errors,
    stats: {
      pullers: scores.length,
      scored: scored.length,
      unrated: unrated.length,
      ranked: scores.filter((score) => score.status === "ranked").length,
      provisional: scores.filter((score) => score.status === "provisional").length,
    },
  };
}

export const INTERPRETATIONS: readonly string[] = [
  "Model ti_v1.1-19: 19 attributes in four families — A Connection (6), B Force delivery (6), C Setup & rule interface (4), D Adaptation (3). Mechanics = A+B over 12; Craft = C+D over 7.",
  "Ratings: green = +1, black = 0, red = −1. A blank is 0 points but is not evidence; it still sits in the family denominator, which is the dilution trade-off the blueprint flags.",
  "Formulas: M = (A+B)/12, K = (C+D)/7, T = 0.7M + 0.3K, r = n/(n+10), TI = 50 + 50·r·T. Raw = 50 + 50·T; Mech = 50 + 50·r·M; Craft = 50 + 50·r·K. n counts one verdict per match per rated attribute.",
  "Tier letters are not defined in the source. They label the blueprint's presentation bands: S 85–100 Elite, A 70–84.9 Strong, B 55–69.9 Functional, C 40–54.9 Developing, D 0–39.9 Mechanical gaps. The source calls these a heuristic, not validated cutoffs.",
  "Status is separate from tier: unrated at n = 0; ranked at ≥3 matches, ≥24 verdicts and ≥75% coverage with both blocks present; otherwise provisional. The formal provisional gate is ≥8 verdicts and ≥50% coverage, so thinner profiles are flagged.",
  "One match cannot produce a 95% band (between-match variance is undefined). Two matches use a t critical value and usually produce a band wider than the scale; that is the blueprint's own result, not a bug.",
];