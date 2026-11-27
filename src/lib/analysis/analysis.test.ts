import { describe, expect, it } from "vitest";
import { compareSessions, intervalPace, sessionMetrics, trendSeries } from "./metrics";
import { summarizeMatch } from "./match";
import { formatSeconds, parseTimeInput } from "./format";
import type { MatchAnalysis, MatchEvent, SpeedSession } from "./types";

const now = "2026-11-27T10:00:00.000Z";

function entry(time: number, distance: number | null = 100, rest: number | null = 60) {
  return { time_sec: time, distance_m: distance, rest_sec: rest };
}

function session(id: string, date: string, intervals: SpeedSession["intervals"]): SpeedSession {
  return {
    id,
    date,
    title: id,
    discipline: "sprint",
    notes: "",
    intervals,
    created_at: now,
    updated_at: now,
  };
}

let seq = 0;
function event(partial: Partial<MatchEvent> & Pick<MatchEvent, "kind" | "t">): MatchEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    frame: Math.round(partial.t * 30),
    round: 1,
    side: null,
    exchange_id: null,
    note: null,
    source: "manual",
    confidence: null,
    data: null,
    created_at: now,
    ...partial,
  };
}

function analysis(events: MatchEvent[], duration = 120): MatchAnalysis {
  return {
    id: "m1",
    title: "Test",
    date: "2026-11-27",
    opponent: "",
    event_name: "",
    fps: 30,
    fps_source: "manual",
    duration_sec: duration,
    video_name: null,
    video_stored: false,
    events,
    notes: "",
    created_at: now,
    updated_at: now,
  };
}

describe("interval math", () => {
  it("derives pace per 100m only when distance is present", () => {
    expect(intervalPace({ time_sec: 12, distance_m: 100, rest_sec: null })).toBe(12);
    expect(intervalPace({ time_sec: 6, distance_m: 50, rest_sec: null })).toBe(12);
    expect(intervalPace({ time_sec: 40, distance_m: null, rest_sec: null })).toBeNull();
  });

  it("computes totals, fade, fatigue point and consistency", () => {
    const metrics = sessionMetrics(session("A", "2026-11-20", [entry(12), entry(12.5), entry(13), entry(13.5, 100, null)]));
    expect(metrics).not.toBeNull();
    const m = metrics!;
    expect(m.basis).toBe("distance");
    expect(m.count).toBe(4);
    expect(m.total_distance_m).toBe(400);
    expect(m.work_sec).toBe(51);
    expect(m.rest_sec).toBe(180);
    expect(m.avg_effort).toBeCloseTo(12.75, 5);
    expect(m.best_effort).toBe(12);
    expect(m.worst_effort).toBe(13.5);
    expect(m.fade_pct).toBeCloseTo(8.1633, 3);
    expect(m.fatigue_point?.index).toBe(2);
    expect(m.consistency_cv_pct).toBeCloseTo(4.3847, 3);
  });

  it("uses per-interval time when distances are missing", () => {
    const m = sessionMetrics(session("B", "2026-11-22", [entry(30, null, 90), entry(31, null, 90), entry(33, null, 90)]))!;
    expect(m.basis).toBe("interval");
    expect(m.avg_effort).toBeCloseTo(31.3333, 3);
    expect(m.total_distance_m).toBeNull();
    expect(m.fade_pct).toBeCloseTo(10, 5);
  });

  it("returns null for an empty session and no fatigue point when improving", () => {
    expect(sessionMetrics(session("C", "2026-11-23", []))).toBeNull();
    const improving = sessionMetrics(session("D", "2026-11-24", [entry(13), entry(12.8), entry(12.5)]))!;
    expect(improving.fade_pct).toBeLessThan(0);
    expect(improving.fatigue_point).toBeNull();
  });

  it("compares sessions and sorts trend points by date", () => {
    const a = session("A", "2026-11-20", [entry(12), entry(12.5), entry(13), entry(13.5)]);
    const b = session("B", "2026-11-22", [entry(12), entry(12), entry(12), entry(12)]);
    const { comparison } = compareSessions(a, b);
    expect(comparison.comparable).toBe(true);
    expect(comparison.effort_delta_pct).toBeCloseTo(-5.882, 2);
    expect(comparison.fade_delta_pp).toBeCloseTo(-8.1633, 2);

    const points = trendSeries([b, a], "avg_effort");
    expect(points.map((p) => p.session_id)).toEqual(["A", "B"]);
    expect(points[1].value).toBeCloseTo(12, 5);
  });

  it("parses and formats times", () => {
    expect(parseTimeInput("1:23.4")).toBeCloseTo(83.4, 5);
    expect(parseTimeInput("83.4")).toBeCloseTo(83.4, 5);
    expect(parseTimeInput("1,5")).toBeCloseTo(1.5, 5);
    expect(parseTimeInput("1:02:03")).toBe(3723);
    expect(parseTimeInput("1:75")).toBeNull();
    expect(parseTimeInput("abc")).toBeNull();
    expect(parseTimeInput("0")).toBeNull();
    expect(parseTimeInput("0:00")).toBeNull();
    expect(formatSeconds(83.4)).toBe("1:23.40");
    expect(formatSeconds(12.75)).toBe("0:12.75");
    expect(formatSeconds(3723)).toBe("62:03.00");
  });
});

describe("match summary", () => {
  const events: MatchEvent[] = [
    event({ kind: "round_start", t: 0, round: 1 }),
    event({ kind: "exchange_start", t: 10, round: 1, side: "athlete", id: "x1" }),
    event({ kind: "first_strike", t: 12, round: 1, side: "opponent", exchange_id: "x1" }),
    event({ kind: "takedown_attempt", t: 13, round: 1, side: "athlete", exchange_id: "x1" }),
    event({ kind: "exchange_start", t: 30, round: 1, side: "opponent", id: "x2" }),
    event({ kind: "first_strike", t: 30.5, round: 1, side: "athlete", exchange_id: "x2" }),
    event({ kind: "positional_change", t: 31, round: 1, side: "athlete", exchange_id: "x2" }),
    event({ kind: "round_start", t: 60, round: 2 }),
    event({ kind: "exchange_start", t: 70, round: 2, side: "athlete", id: "x3" }),
    event({ kind: "first_strike", t: 74, round: 2, side: "athlete", exchange_id: "x3" }),
    event({ kind: "exchange_start", t: 100, round: 2, side: "opponent", id: "x4" }),
    event({ kind: "takedown_attempt", t: 101, round: 2, side: "opponent", exchange_id: "x4" }),
  ];

  it("groups tags into exchanges and totals initiations", () => {
    const summary = summarizeMatch(analysis([...events].reverse()));
    expect(summary.exchanges.map((e) => e.id)).toEqual(["x1", "x2", "x3", "x4"]);
    expect(summary.exchanges.map((e) => e.end_t)).toEqual([30, 60, 100, 120]);
    expect(summary.athlete_initiations).toBe(2);
    expect(summary.opponent_initiations).toBe(2);
    expect(summary.athlete_share).toBeCloseTo(0.5, 5);
    expect(summary.first_strikes).toEqual({ athlete: 2, opponent: 1, untagged: 0 });
    expect(summary.event_count).toBe(10);
    expect(summary.takedowns).toEqual({ athlete: 1, opponent: 1 });
    expect(summary.positional_changes).toEqual({ athlete: 1, opponent: 0, unknown: 0 });
    expect(summary.rounds).toEqual([
      { round: 1, exchanges: 2, athlete_initiations: 1, opponent_initiations: 1, athlete_first_strikes: 1, opponent_first_strikes: 1 },
      { round: 2, exchanges: 2, athlete_initiations: 1, opponent_initiations: 1, athlete_first_strikes: 1, opponent_first_strikes: 0 },
    ]);
  });

  it("estimates defender response time after each initiator", () => {
    const summary = summarizeMatch(analysis(events));
    // x1: athlete starts, opponent strikes at +2. x3: athlete starts and strikes first, so no defender response there.
    expect(summary.time_to_first_strike.after_athlete_init.count).toBe(1);
    expect(summary.time_to_first_strike.after_athlete_init.avg).toBeCloseTo(2, 5);
    expect(summary.time_to_first_strike.after_opponent_init.count).toBe(1);
    expect(summary.time_to_first_strike.after_opponent_init.avg).toBeCloseTo(0.5, 5);
    expect(summary.time_to_first_strike.overall.count).toBe(2);
    expect(summary.time_to_first_strike.overall.avg).toBeCloseTo(1.25, 5);
  });

  it("keeps tags that arrive before the first exchange and empty analyses stable", () => {
    const orphan = summarizeMatch(
      analysis([
        event({ kind: "first_strike", t: 5, round: 1, side: "athlete" }),
        event({ kind: "exchange_start", t: 20, round: 1, side: "opponent", id: "y1" }),
        event({ kind: "first_strike", t: 21, round: 1, side: "opponent", exchange_id: "y1" }),
      ]),
    );
    expect(orphan.exchanges).toHaveLength(2);
    expect(orphan.exchanges[0].initiator).toBeNull();
    expect(orphan.unmarked_exchanges).toBe(1);
    expect(orphan.athlete_share).toBe(0);
    // No exchange has a tagged strike from the defender, so there is no response estimate.
    expect(orphan.time_to_first_strike.overall.count).toBe(0);

    const empty = summarizeMatch(analysis([]));
    expect(empty.exchanges).toEqual([]);
    expect(empty.athlete_share).toBeNull();
    expect(empty.rounds).toEqual([]);
    expect(empty.time_to_first_strike.overall).toEqual({ count: 0, avg: null, median: null });
  });
});
