export type Rating = "green" | "red" | "black";
export type PullerSide = "left" | "right";
export type SourceType = "youtube" | "upload";

export type Profile = {
  id: string;
  handle: string | null;
  plan: "free" | "pro";
  created_at: string;
};

export type Match = {
  id: string;
  user_id?: string;
  title: string;
  event_name: string | null;
  left_puller: string;
  right_puller: string;
  source_type: SourceType;
  youtube_id: string | null;
  video_path: string | null;
  duration_sec: number | null;
  fps: number | null;
  status: "active" | "archived";
  created_at: string;
};

export type RubricAttribute = {
  id: string;
  template_id: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
};

export type Annotation = {
  id: string;
  match_id: string;
  attribute_id: string;
  puller_side: PullerSide;
  round_number: number;
  timestamp_sec: number;
  rating: Rating;
  note: string | null;
  frame_path: string | null;
  created_at: string;
};

export type AnnotationWithFrame = Annotation & { frame_url: string | null };

export type RoundBoundary = {
  id: string;
  match_id: string;
  round_number: number;
  start_sec: number;
  end_sec: number | null;
};

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: "free_tier_limit" | "unauthorized" | "not_found" | "invalid" | "rate_limited" };
