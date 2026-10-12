import type { PublicCard } from "@/lib/card";
import { buildPullerSummary } from "@/lib/verdict";
import { youtubeThumbnail } from "@/lib/youtube";
import type { Annotation, Match, PullerSide, Rating, RubricAttribute } from "@/lib/types";

const RUBRIC = [
  "Fingers",
  "Depth (pronator)",
  "Palm",
  "Wrist",
  "Riser",
  "The turn",
  "Strategic fouling",
  "Versatility",
  "Counter style",
  "Optimal vector application",
  "Shoulder line",
  "Elbow positioning",
  "Ref's grip",
  "Out of strap",
  "Initial grip",
  "Talking to the ref",
];

const NOTES: [string, PullerSide, number, number, Rating, string][] = [
  ["Talking to the ref", "right", 1, 20, "green", "Communicates well, gets refs to listen"],
  ["Strategic fouling", "right", 1, 30, "red", "Fidgeted, got 2nd foul — lost the round on fouls"],
  ["Versatility", "left", 2, 75, "green", "Flop press transition + strap usage gave him options Janis lacked"],
  ["Elbow positioning", "right", 2, 110, "red", "Stuck in position; elbow moved back before hand control"],
  ["Counter style", "left", 3, 150, "green", "Great mid-table vector change in strap — Janis had no answer"],
  ["Fingers", "right", 3, 185, "red", "Let Mindaugas establish depth"],
];

const attributes: RubricAttribute[] = RUBRIC.map((name, i) => ({
  id: `demo-attr-${i}`,
  template_id: "demo",
  name,
  description: null,
  display_order: i + 1,
  is_active: true,
}));

const annotations: Annotation[] = NOTES.map(([attr, side, round, ts, rating, note], i) => ({
  id: `demo-ann-${i}`,
  match_id: "demo",
  attribute_id: attributes.find((a) => a.name === attr)!.id,
  puller_side: side,
  round_number: round,
  timestamp_sec: ts,
  rating,
  note,
  frame_path: null,
  created_at: "2026-01-01T00:00:00Z",
}));

const match: Match = {
  id: "demo",
  title: "EVW 17 — Janis Amolins vs. Mindaugas Tarasaitis",
  event_name: "East vs West 17",
  left_puller: "Mindaugas Tarasaitis",
  right_puller: "Janis Amolins",
  source_type: "youtube",
  youtube_id: "wBRBQlVCn1U",
  video_path: null,
  duration_sec: null,
  fps: 30,
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
};

export const DEMO_CARD: PublicCard = {
  slug: "demo",
  plan: "free",
  ownerHandle: null,
  match,
  thumbnail: youtubeThumbnail(match.youtube_id!),
  videoUrl: null,
  rounds: [],
  left: buildPullerSummary("left", match.left_puller, attributes, annotations),
  right: buildPullerSummary("right", match.right_puller, attributes, annotations),
  frameUrls: {},
};
