import type { IntervalEntry, SpeedSession } from "./types";

export type EffortBasis = "distance" | "interval";

export type IntervalMetric = {
  index: number;
  distance_m: number | null;
  time_sec: number;
  rest_sec: number | null;
  /** Seconds per 100 m when the interval has a distance; otherwise null. */
  pace_sec_per_100m: number | null;
  /** Seconds per 100 m if known, else seconds per interval. */
  effort: number;
  /** Percent change in effort vs the previous interval (positive = slower). */
  delta_pct: number | null;
};

export type SessionMetrics = {
  basis: EffortBasis;
  count: number;
  total_distance_m: number | null;
  work_sec: number;
  rest_sec: number;
  total_sec: number;
  avg_effort: number;
  best_effort: number;
  worst_effort: number;
  avg_interval_sec: number | null;
  /** First-half vs second-half effort change. Positive = faded (slowed) as the session went on. */
  fade_pct: number | null;
  /** First repeat where effort drops most; null when the session got faster or stayed flat. */
  fatigue_point: { index: number; delta_pct: number } | null;
  /** Coefficient of variation of effort, in percent. Lower is more even. */
  consistency_cv_pct: number | null;
  intervals: IntervalMetric[];
};

export function intervalPace(entry: IntervalEntry): number | null {
  if (!entry.distance_m || entry.distance_m <= 0 || entry.time_sec <= 0) return null;
  return entry.time_sec / (entry.distance_m / 100);
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function sessionMetrics(session: SpeedSession): SessionMetrics | null {
  const entries = session.intervals.filter((i) => Number.isFinite(i.time_sec) && i.time_sec > 0);
  if (!entries.length) return null;

  const allPaced = entries.every((i) => intervalPace(i) !== null);
  const basis: EffortBasis = allPaced ? "distance" : "interval";
  const efforts = entries.map((i) => (basis === "distance" ? (intervalPace(i) as number) : i.time_sec));

  const intervals: IntervalMetric[] = entries.map((entry, index) => ({
    index: index + 1,
    distance_m: entry.distance_m,
    time_sec: entry.time_sec,
    rest_sec: entry.rest_sec,
    pace_sec_per_100m: intervalPace(entry),
    effort: efforts[index],
    delta_pct: index === 0 ? null : ((efforts[index] - efforts[index - 1]) / efforts[index - 1]) * 100,
  }));

  const totalDistance = entries.every((i) => i.distance_m !== null) ? entries.reduce((s, i) => s + (i.distance_m ?? 0), 0) : null;
  const workSec = entries.reduce((s, i) => s + i.time_sec, 0);
  const restSec = entries.reduce((s, i) => s + (i.rest_sec ?? 0), 0);

  let fade: number | null = null;
  if (entries.length >= 2) {
    const half = Math.floor(entries.length / 2);
    const first = mean(efforts.slice(0, half));
    const second = mean(efforts.slice(-half));
    if (first > 0) fade = ((second - first) / first) * 100;
  }

  let fatigue: SessionMetrics["fatigue_point"] = null;
  for (let i = 1; i < efforts.length; i++) {
    const delta = ((efforts[i] - efforts[i - 1]) / efforts[i - 1]) * 100;
    if (delta > 0 && (!fatigue || delta > fatigue.delta_pct)) fatigue = { index: i + 1, delta_pct: delta };
  }

  const avg = basis === "distance" && totalDistance ? workSec / (totalDistance / 100) : mean(efforts);
  const sd = Math.sqrt(mean(efforts.map((e) => (e - avg) ** 2)));

  return {
    basis,
    count: entries.length,
    total_distance_m: totalDistance,
    work_sec: workSec,
    rest_sec: restSec,
    total_sec: workSec + restSec,
    avg_effort: avg,
    best_effort: Math.min(...efforts),
    worst_effort: Math.max(...efforts),
    avg_interval_sec: mean(entries.map((i) => i.time_sec)),
    fade_pct: fade,
    fatigue_point: fatigue,
    consistency_cv_pct: avg > 0 ? (sd / avg) * 100 : null,
    intervals,
  };
}

export type TrendMetric = "avg_effort" | "best_effort" | "work_sec";

export type TrendPoint = {
  session_id: string;
  date: string;
  title: string;
  basis: EffortBasis;
  value: number;
};

export function trendSeries(sessions: SpeedSession[], metric: TrendMetric): TrendPoint[] {
  return sessions
    .map((session) => {
      const metrics = sessionMetrics(session);
      if (!metrics) return null;
      const value = metric === "avg_effort" ? metrics.avg_effort : metric === "best_effort" ? metrics.best_effort : metrics.work_sec;
      if (!Number.isFinite(value) || value <= 0) return null;
      return { session_id: session.id, date: session.date, title: session.title, basis: metrics.basis, value };
    })
    .filter((p): p is TrendPoint => p !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type SessionComparison = {
  comparable: boolean;
  /** Percent change in average effort from A to B. Negative means B is faster. */
  effort_delta_pct: number | null;
  /** Change in fade percentage points from A to B. Negative means B held pace better. */
  fade_delta_pp: number | null;
  consistency_delta_pp: number | null;
};

export function compareSessions(a: SpeedSession, b: SpeedSession): { a: SessionMetrics | null; b: SessionMetrics | null; comparison: SessionComparison } {
  const ma = sessionMetrics(a);
  const mb = sessionMetrics(b);
  if (!ma || !mb) {
    return { a: ma, b: mb, comparison: { comparable: false, effort_delta_pct: null, fade_delta_pp: null, consistency_delta_pp: null } };
  }
  const comparable = ma.basis === mb.basis;
  return {
    a: ma,
    b: mb,
    comparison: {
      comparable,
      effort_delta_pct: ma.avg_effort > 0 ? ((mb.avg_effort - ma.avg_effort) / ma.avg_effort) * 100 : null,
      fade_delta_pp: ma.fade_pct !== null && mb.fade_pct !== null ? mb.fade_pct - ma.fade_pct : null,
      consistency_delta_pp:
        ma.consistency_cv_pct !== null && mb.consistency_cv_pct !== null ? mb.consistency_cv_pct - ma.consistency_cv_pct : null,
    },
  };
}
