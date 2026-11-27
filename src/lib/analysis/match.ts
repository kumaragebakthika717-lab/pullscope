import type { EventSide, MatchAnalysis, MatchEvent } from "./types";

export type StatSummary = { count: number; avg: number | null; median: number | null };

export type ExchangeSummary = {
  id: string;
  round: number;
  start_t: number;
  end_t: number | null;
  initiator: EventSide | null;
  first_strike_t: number | null;
  first_strike_side: EventSide | null;
  /** Seconds from the exchange start to the first strike tag, if both exist. */
  time_to_first_strike: number | null;
  /** Seconds from the exchange start to the non-initiator's first strike, if tagged. */
  responder_strike_t: number | null;
  takedown_attempts: number;
  positional_changes: number;
  event_ids: string[];
};

export type RoundBreakdown = {
  round: number;
  exchanges: number;
  athlete_initiations: number;
  opponent_initiations: number;
  athlete_first_strikes: number;
  opponent_first_strikes: number;
};

export type MatchSummary = {
  exchanges: ExchangeSummary[];
  athlete_initiations: number;
  opponent_initiations: number;
  unmarked_exchanges: number;
  /** Share of marked exchanges the athlete initiated, 0..1. */
  athlete_share: number | null;
  first_strikes: { athlete: number; opponent: number; untagged: number };
  /**
   * Time from an exchange start to the non-initiator's first strike tag. After the athlete
   * initiates this is the opponent's response window (an estimate, not a measured reaction).
   * Exchanges where only the initiator struck are not counted — there is no defender response.
   */
  time_to_first_strike: {
    after_athlete_init: StatSummary;
    after_opponent_init: StatSummary;
    overall: StatSummary;
  };
  takedowns: { athlete: number; opponent: number };
  positional_changes: { athlete: number; opponent: number; unknown: number };
  rounds: RoundBreakdown[];
  event_count: number;
};

function stat(values: number[]): StatSummary {
  if (!values.length) return { count: 0, avg: null, median: null };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return {
    count: sorted.length,
    avg: sorted.reduce((s, v) => s + v, 0) / sorted.length,
    median: sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
  };
}

export function sortEvents(events: MatchEvent[]): MatchEvent[] {
  return [...events].sort((a, b) => a.t - b.t || a.created_at.localeCompare(b.created_at));
}

export function summarizeMatch(analysis: MatchAnalysis): MatchSummary {
  const events = sortEvents(analysis.events);
  const exchanges: ExchangeSummary[] = [];
  let current: ExchangeSummary | null = null;

  function ensureExchange(seed: MatchEvent): ExchangeSummary {
    if (!current) {
      current = {
        id: `implicit-${seed.id}`,
        round: seed.round,
        start_t: seed.t,
        end_t: null,
        initiator: null,
        first_strike_t: null,
        first_strike_side: null,
        time_to_first_strike: null,
        responder_strike_t: null,
        takedown_attempts: 0,
        positional_changes: 0,
        event_ids: [],
      };
      exchanges.push(current);
    }
    return current;
  }

  for (const event of events) {
    if (event.kind === "round_start") continue;
    if (event.kind === "exchange_start") {
      current = {
        id: event.id,
        round: event.round,
        start_t: event.t,
        end_t: null,
        initiator: event.side,
        first_strike_t: null,
        first_strike_side: null,
        time_to_first_strike: null,
        responder_strike_t: null,
        takedown_attempts: 0,
        positional_changes: 0,
        event_ids: [event.id],
      };
      exchanges.push(current);
      continue;
    }
    const exchange = ensureExchange(event);
    exchange.event_ids.push(event.id);
    if (event.kind === "first_strike") {
      if (exchange.first_strike_t === null) {
        exchange.first_strike_t = event.t;
        exchange.first_strike_side = event.side;
        exchange.time_to_first_strike = Math.max(0, event.t - exchange.start_t);
      }
      if (
        exchange.responder_strike_t === null &&
        exchange.initiator !== null &&
        event.side !== null &&
        event.side !== exchange.initiator
      ) {
        exchange.responder_strike_t = Math.max(0, event.t - exchange.start_t);
      }
    }
    if (event.kind === "takedown_attempt") exchange.takedown_attempts += 1;
    if (event.kind === "positional_change") exchange.positional_changes += 1;
  }

  const roundStarts = events.filter((e) => e.kind === "round_start").map((e) => e.t);
  exchanges.forEach((exchange, index) => {
    const next = exchanges[index + 1];
    const nextRound = roundStarts.find((t) => t > exchange.start_t);
    const lastEvent = events.filter((e) => exchange.event_ids.includes(e.id)).reduce((max, e) => Math.max(max, e.t), exchange.start_t);
    // An exchange ends at the next exchange or round boundary, whichever comes first.
    let end: number | null = next ? next.start_t : null;
    if (nextRound !== undefined && (end === null || nextRound < end)) end = nextRound;
    if (end === null && analysis.duration_sec && analysis.duration_sec > exchange.start_t) end = analysis.duration_sec;
    if (end === null && lastEvent > exchange.start_t) end = lastEvent;
    exchange.end_t = end;
  });

  const marked = exchanges.filter((e) => e.initiator !== null);
  const athleteInitiations = marked.filter((e) => e.initiator === "athlete").length;
  const opponentInitiations = marked.filter((e) => e.initiator === "opponent").length;

  const afterAthlete: number[] = [];
  const afterOpponent: number[] = [];
  for (const exchange of exchanges) {
    if (exchange.responder_strike_t === null) continue;
    if (exchange.initiator === "athlete") afterAthlete.push(exchange.responder_strike_t);
    if (exchange.initiator === "opponent") afterOpponent.push(exchange.responder_strike_t);
  }

  const firstStrikeEvents = events.filter((e) => e.kind === "first_strike");
  const firstStrikes = {
    athlete: firstStrikeEvents.filter((e) => e.side === "athlete").length,
    opponent: firstStrikeEvents.filter((e) => e.side === "opponent").length,
    untagged: firstStrikeEvents.filter((e) => e.side === null).length,
  };

  const takedownEvents = events.filter((e) => e.kind === "takedown_attempt");
  const positionalEvents = events.filter((e) => e.kind === "positional_change");

  const roundNumbers = new Set<number>();
  for (const e of events) roundNumbers.add(e.round);
  for (const e of exchanges) roundNumbers.add(e.round);
  const rounds: RoundBreakdown[] = [...roundNumbers]
    .sort((a, b) => a - b)
    .map((round) => {
      const roundExchanges = exchanges.filter((e) => e.round === round);
      return {
        round,
        exchanges: roundExchanges.length,
        athlete_initiations: roundExchanges.filter((e) => e.initiator === "athlete").length,
        opponent_initiations: roundExchanges.filter((e) => e.initiator === "opponent").length,
        athlete_first_strikes: roundExchanges.filter((e) => e.first_strike_side === "athlete").length,
        opponent_first_strikes: roundExchanges.filter((e) => e.first_strike_side === "opponent").length,
      };
    });

  return {
    exchanges,
    athlete_initiations: athleteInitiations,
    opponent_initiations: opponentInitiations,
    unmarked_exchanges: exchanges.length - marked.length,
    athlete_share: marked.length ? athleteInitiations / marked.length : null,
    first_strikes: firstStrikes,
    time_to_first_strike: {
      after_athlete_init: stat(afterAthlete),
      after_opponent_init: stat(afterOpponent),
      overall: stat([...afterAthlete, ...afterOpponent]),
    },
    takedowns: {
      athlete: takedownEvents.filter((e) => e.side === "athlete").length,
      opponent: takedownEvents.filter((e) => e.side === "opponent").length,
    },
    positional_changes: {
      athlete: positionalEvents.filter((e) => e.side === "athlete").length,
      opponent: positionalEvents.filter((e) => e.side === "opponent").length,
      unknown: positionalEvents.filter((e) => e.side === null).length,
    },
    rounds,
    event_count: events.filter((e) => e.kind !== "round_start").length,
  };
}
