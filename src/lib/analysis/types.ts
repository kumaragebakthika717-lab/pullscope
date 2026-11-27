/** Local-only performance analysis domain. Persisted in IndexedDB; never sent to the server. */

export type SpeedDiscipline = "sprint" | "rounds" | "distance";

export type IntervalEntry = {
  distance_m: number | null;
  time_sec: number;
  rest_sec: number | null;
};

export type SpeedSession = {
  id: string;
  date: string;
  title: string;
  discipline: SpeedDiscipline;
  notes: string;
  intervals: IntervalEntry[];
  created_at: string;
  updated_at: string;
};

/**
 * Manual tags today. `source`, `confidence` and `data` exist so pose tracking (MediaPipe)
 * can write events later without a schema change: pose adds events with source "pose",
 * a confidence and keypoints in `data`, keyed to the same frame/timebase.
 */
export type TagSource = "manual" | "pose" | "sensor";

export type MatchEventKind =
  | "round_start"
  | "exchange_start"
  | "first_strike"
  | "takedown_attempt"
  | "positional_change";

export type EventSide = "athlete" | "opponent";

export type MatchEvent = {
  id: string;
  kind: MatchEventKind;
  /** Seconds from the start of the video. */
  t: number;
  /** Frame index at the analysis fps, so future pose data can align exactly. */
  frame: number;
  round: number;
  side: EventSide | null;
  /** id of the exchange_start event this tag belongs to (set for sub-events). */
  exchange_id: string | null;
  note: string | null;
  source: TagSource;
  confidence: number | null;
  /** Reserved payload for pose keypoints / bounding boxes. */
  data: Record<string, unknown> | null;
  created_at: string;
};

export type FpsSource = "detected" | "manual" | "default";

export type MatchAnalysis = {
  id: string;
  title: string;
  date: string;
  opponent: string;
  event_name: string;
  fps: number;
  fps_source: FpsSource;
  duration_sec: number | null;
  video_name: string | null;
  /** True when the video file itself is kept in IndexedDB on this device. */
  video_stored: boolean;
  events: MatchEvent[];
  notes: string;
  created_at: string;
  updated_at: string;
};
