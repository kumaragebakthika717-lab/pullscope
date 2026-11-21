import type { Rating } from "./types";

export const FREE_MATCH_LIMIT = 3;
export const DEFAULT_FPS = 30;
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
export const MAX_UPLOAD_SECONDS = 30 * 60;
export const PLAYBACK_RATES = [0.25, 0.5, 1, 1.5, 2] as const;
export const OVERALL_ROUND = 0;
export const ROUND_OPTIONS = [1, 2, 3, 4, 5, 6, 7, OVERALL_ROUND] as const;

export const RATING_COLORS: Record<Rating, string> = {
  green: "#22c55e",
  red: "#ef4444",
  black: "#404040",
};

export const RATING_LABELS: Record<Rating, string> = {
  green: "Green",
  red: "Red",
  black: "Black",
};

export function roundLabel(n: number) {
  return n === OVERALL_ROUND ? "Overall" : `Round ${n}`;
}
