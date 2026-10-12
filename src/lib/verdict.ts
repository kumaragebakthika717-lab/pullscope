import { OVERALL_ROUND } from "./constants";
import type { Annotation, PullerSide, Rating, RubricAttribute } from "./types";

export type Verdict = Rating | "unrated";

export type AttributeRow = {
  attribute: RubricAttribute;
  counts: Record<Rating, number>;
  verdict: Verdict;
  evidence: Annotation[];
};

export type PullerSummary = {
  side: PullerSide;
  name: string;
  rows: AttributeRow[];
  totals: Record<Verdict, number>;
};

// "Overall" annotations are the analyst's final word, so they outrank any numbered round.
function roundRank(round: number) {
  return round === OVERALL_ROUND ? Number.POSITIVE_INFINITY : round;
}

/** Verdict = rating of the annotation in the highest round, latest timestamp within it. */
export function computeVerdict(annotations: Pick<Annotation, "round_number" | "timestamp_sec" | "rating">[]): Verdict {
  let best: (typeof annotations)[number] | null = null;
  for (const a of annotations) {
    if (
      !best ||
      roundRank(a.round_number) > roundRank(best.round_number) ||
      (roundRank(a.round_number) === roundRank(best.round_number) && a.timestamp_sec > best.timestamp_sec)
    ) {
      best = a;
    }
  }
  return best ? best.rating : "unrated";
}

export function buildPullerSummary(
  side: PullerSide,
  name: string,
  attributes: RubricAttribute[],
  annotations: Annotation[],
): PullerSummary {
  const totals: Record<Verdict, number> = { green: 0, red: 0, black: 0, unrated: 0 };
  const rows = attributes
    .filter((a) => a.is_active)
    .sort((a, b) => a.display_order - b.display_order)
    .map((attribute) => {
      const evidence = annotations
        .filter((an) => an.attribute_id === attribute.id && an.puller_side === side)
        .sort((x, y) => x.timestamp_sec - y.timestamp_sec);
      const counts: Record<Rating, number> = { green: 0, red: 0, black: 0 };
      evidence.forEach((e) => counts[e.rating]++);
      const verdict = computeVerdict(evidence);
      totals[verdict]++;
      return { attribute, counts, verdict, evidence };
    });
  return { side, name, rows, totals };
}
