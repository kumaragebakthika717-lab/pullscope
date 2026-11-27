"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Flag,
  Loader2,
  Move,
  Pencil,
  Repeat,
  Swords,
  Target,
  Trash2,
  Upload,
  User,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { VideoPlayer, type PlayerHandle } from "@/components/workspace/video-player";
import { createTimeStore, useTime, type TimeStore } from "@/lib/time-store";
import { formatTimecode } from "@/lib/timecode";
import { summarizeMatch, type MatchSummary } from "@/lib/analysis/match";
import { formatDate, formatSeconds } from "@/lib/analysis/format";
import { frameAt } from "@/lib/analysis/video";
import type { EventSide, MatchAnalysis, MatchEvent, MatchEventKind } from "@/lib/analysis/types";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<MatchEventKind, string> = {
  round_start: "Round start",
  exchange_start: "Exchange",
  first_strike: "First strike",
  takedown_attempt: "Takedown attempt",
  positional_change: "Position change",
};

const KIND_ICONS: Record<MatchEventKind, typeof Swords> = {
  round_start: Repeat,
  exchange_start: Swords,
  first_strike: Target,
  takedown_attempt: Move,
  positional_change: Flag,
};

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.getAttribute("role") === "combobox";
}

export function MatchEditor({
  analysis,
  videoUrl,
  onChange,
  onClose,
  onEditDetails,
  onDelete,
  onAttachVideo,
}: {
  analysis: MatchAnalysis;
  videoUrl: string | null;
  onChange: (next: MatchAnalysis) => void;
  onClose: () => void;
  onEditDetails: () => void;
  onDelete: () => void;
  onAttachVideo: (file: File, keep: boolean) => Promise<void>;
}) {
  const player = useRef<PlayerHandle>(null);
  const [timeStore] = useState(createTimeStore);
  const [side, setSide] = useState<EventSide>("athlete");
  const [notes, setNotes] = useState(analysis.notes);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [keepFile, setKeepFile] = useState(true);
  const latest = useRef(analysis);
  latest.current = analysis;
  const sideRef = useRef(side);
  sideRef.current = side;

  const fps = analysis.fps;
  const opponentName = analysis.opponent || "Opponent";
  const summary = summarizeMatch(analysis);
  const source = useMemo<{ kind: "upload"; url: string } | null>(() => (videoUrl ? { kind: "upload", url: videoUrl } : null), [videoUrl]);
  const events = [...analysis.events].sort((a, b) => b.t - a.t || b.created_at.localeCompare(a.created_at));

  const commit = useCallback(
    (next: MatchAnalysis) => {
      latest.current = next;
      onChange(next);
    },
    [onChange],
  );

  const roundAt = useCallback((t: number) => {
    let round = 1;
    for (const event of latest.current.events) {
      if (event.kind === "round_start" && event.t <= t + 1e-6) round = Math.max(round, event.round);
    }
    return round;
  }, []);

  const addEvent = useCallback(
    (kind: MatchEventKind, eventSide: EventSide | null) => {
      const p = player.current;
      if (!p) return;
      p.pause();
      const t = p.getCurrentTime();
      const id = crypto.randomUUID();
      const base = latest.current;
      let exchangeId: string | null = null;
      if (kind !== "exchange_start") {
        let best: MatchEvent | null = null;
        for (const event of base.events) {
          if (event.kind === "exchange_start" && event.t <= t + 1e-6 && (!best || event.t > best.t)) best = event;
        }
        exchangeId = best?.id ?? null;
      }
      const event: MatchEvent = {
        id,
        kind,
        t,
        frame: frameAt(t, fps),
        round: roundAt(t),
        side: eventSide,
        exchange_id: exchangeId,
        note: null,
        source: "manual",
        confidence: null,
        data: null,
        created_at: new Date().toISOString(),
      };
      commit({ ...base, events: [...base.events, event], updated_at: event.created_at });
    },
    [commit, fps, roundAt],
  );

  const markRound = useCallback(() => {
    const p = player.current;
    if (!p) return;
    p.pause();
    const t = p.getCurrentTime();
    const base = latest.current;
    const hasRoundStart = base.events.some((event) => event.kind === "round_start");
    const highest = base.events.reduce((max, event) => Math.max(max, event.round), 1);
    const event: MatchEvent = {
      id: crypto.randomUUID(),
      kind: "round_start",
      t,
      frame: frameAt(t, fps),
      round: hasRoundStart ? highest + 1 : 1,
      side: null,
      exchange_id: null,
      note: null,
      source: "manual",
      confidence: null,
      data: null,
      created_at: new Date().toISOString(),
    };
    commit({ ...base, events: [...base.events, event], updated_at: event.created_at });
  }, [commit, fps]);

  const deleteEvent = useCallback(
    (event: MatchEvent) => {
      const base = latest.current;
      if (event.kind === "exchange_start") {
        const attached = base.events.filter((candidate) => candidate.exchange_id === event.id).length;
        if (attached > 0 && !window.confirm(`Delete this exchange and its ${attached} attached tag${attached === 1 ? "" : "s"}?`)) return;
      }
      commit({
        ...base,
        events: base.events.filter((candidate) => candidate.id !== event.id && candidate.exchange_id !== event.id),
        updated_at: new Date().toISOString(),
      });
    },
    [commit],
  );

  const seekTo = useCallback((t: number) => {
    player.current?.pause();
    player.current?.seek(t);
  }, []);

  const onDuration = useCallback(
    (duration: number) => {
      const base = latest.current;
      if (!base.duration_sec || Math.abs(base.duration_sec - duration) > 0.5) {
        commit({ ...base, duration_sec: duration, updated_at: new Date().toISOString() });
      }
    },
    [commit],
  );

  const saveNotes = useCallback(() => {
    const base = latest.current;
    if (notes === base.notes) return;
    commit({ ...base, notes, updated_at: new Date().toISOString() });
  }, [commit, notes]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector("[role=dialog], [role=alertdialog]")) return;
      if (isTypingTarget(e.target)) return;
      const p = player.current;
      if (!p) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      switch (e.key) {
        case " ":
          if (target?.closest("button, a")) return;
          e.preventDefault();
          p.toggle();
          break;
        case ",":
        case "<":
          e.preventDefault();
          p.stepFrame(-1);
          break;
        case ".":
        case ">":
          e.preventDefault();
          p.stepFrame(1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          p.seekBy(-1);
          break;
        case "ArrowRight":
          e.preventDefault();
          p.seekBy(1);
          break;
        case "i":
        case "I":
          e.preventDefault();
          addEvent("exchange_start", "athlete");
          break;
        case "o":
        case "O":
          e.preventDefault();
          addEvent("exchange_start", "opponent");
          break;
        case "f":
        case "F":
          e.preventDefault();
          addEvent("first_strike", sideRef.current);
          break;
        case "t":
        case "T":
          e.preventDefault();
          addEvent("takedown_attempt", sideRef.current);
          break;
        case "p":
        case "P":
          e.preventDefault();
          addEvent("positional_change", sideRef.current);
          break;
        case "x":
        case "X":
          e.preventDefault();
          setSide((current) => (current === "athlete" ? "opponent" : "athlete"));
          break;
        case "r":
        case "R":
          e.preventDefault();
          markRound();
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addEvent, markRound]);

  async function attach(file: File | null) {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES && keepFile) setKeepFile(false);
    setAttaching(true);
    setAttachError(null);
    try {
      await onAttachVideo(file, keepFile && file.size <= MAX_UPLOAD_BYTES);
    } catch (e) {
      setAttachError((e as Error).message);
    } finally {
      setAttaching(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <header className="flex flex-wrap items-start gap-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft /> All matches
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-bold uppercase tracking-wide">{analysis.title}</h1>
          <p className="text-xs text-muted-foreground">
            {formatDate(analysis.date)} · vs {opponentName}
            {analysis.event_name ? ` · ${analysis.event_name}` : ""} · {fps} fps
            {analysis.fps_source === "default" ? " (default — set the real fps if stepping looks off)" : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="hidden sm:inline-flex">
            Saved locally
          </Badge>
          <Button variant="ghost" size="icon-sm" aria-label="Edit match details" onClick={onEditDetails}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Delete match analysis" onClick={onDelete}>
            <Trash2 />
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          {source ? (
            <VideoPlayer ref={player} source={source} fps={fps} timeStore={timeStore} onDuration={onDuration} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Video not stored</CardTitle>
                <CardDescription>
                  This match was saved without the video. Load the same file to review it — the tags line up with the video&apos;s timeline.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,video/x-matroska,video/*"
                  aria-label="Load the match video"
                  disabled={attaching}
                  onChange={(e) => void attach(e.target.files?.[0] ?? null)}
                />
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-[#f59e0b]"
                    checked={keepFile}
                    onChange={(e) => setKeepFile(e.target.checked)}
                  />
                  Keep this copy in the browser for next time (under 500 MB).
                </label>
                {attaching && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Loading video…
                  </p>
                )}
                {attachError && (
                  <p className="text-sm text-bad" role="alert">
                    {attachError}
                  </p>
                )}
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Upload className="size-3.5" /> If the browser blocks the file, use an MP4 (H.264).
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Tag an exchange</CardTitle>
                <div className="flex items-center gap-2">
                  <PlayheadRound timeStore={timeStore} roundAt={roundAt} />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!videoUrl}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      markRound();
                    }}
                  >
                    <Repeat /> New round (R)
                  </Button>
                </div>
              </div>
              <CardDescription>
                Frame-step with <span className="text-foreground">,</span> / <span className="text-foreground">.</span>, then tag the
                moment. Sub-tags attach to the exchange in play at the playhead.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  className="h-12 justify-start font-semibold"
                  disabled={!videoUrl}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    addEvent("exchange_start", "athlete");
                  }}
                >
                  <Zap /> I initiated <span className="ml-auto text-xs opacity-60">I</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-12 justify-start font-semibold"
                  disabled={!videoUrl}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    addEvent("exchange_start", "opponent");
                  }}
                >
                  <Swords /> Opponent initiated <span className="ml-auto text-xs opacity-60">O</span>
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5">
                <span className="text-xs text-muted-foreground">Sub-tags apply to</span>
                <div className="flex rounded bg-background p-0.5" role="group" aria-label="Tag side">
                  {(["athlete", "opponent"] as EventSide[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setSide(option)}
                      className={cn(
                        "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground",
                        side === option && "bg-accent text-foreground",
                      )}
                    >
                      {option === "athlete" ? <User className="size-3" /> : <Swords className="size-3" />}
                      {option === "athlete" ? "You" : opponentName}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">· toggle with X</span>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <Button
                  variant="secondary"
                  disabled={!videoUrl}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    addEvent("first_strike", side);
                  }}
                >
                  <Target /> First strike <span className="ml-auto text-xs opacity-60">F</span>
                </Button>
                <Button
                  variant="secondary"
                  disabled={!videoUrl}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    addEvent("takedown_attempt", side);
                  }}
                >
                  <Move /> Takedown attempt <span className="ml-auto text-xs opacity-60">T</span>
                </Button>
                <Button
                  variant="secondary"
                  disabled={!videoUrl}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    addEvent("positional_change", side);
                  }}
                >
                  <Flag /> Position change <span className="ml-auto text-xs opacity-60">P</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tagged events</CardTitle>
              <CardDescription>{analysis.events.length} tags. Click a row to jump to its frame.</CardDescription>
            </CardHeader>
            <CardContent className="max-h-80 space-y-1 overflow-y-auto">
              {events.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No tags yet.</p>}
              {events.map((event) => {
                const Icon = KIND_ICONS[event.kind];
                const sideName = event.side === "athlete" ? "You" : event.side === "opponent" ? opponentName : null;
                return (
                  <div key={event.id} className="group flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => seekTo(event.t)}
                      title="Jump to this moment"
                    >
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatTimecode(event.t, fps)}</span>
                      <Icon className={cn("size-3.5 shrink-0", event.side === "athlete" ? "text-brand" : "text-muted-foreground")} />
                      <span className="truncate">{KIND_LABELS[event.kind]}</span>
                      {sideName && <span className="truncate text-xs text-muted-foreground">{sideName}</span>}
                      <Badge variant="outline" className="ml-auto shrink-0 text-[0.6rem]">
                        R{event.round}
                      </Badge>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label={`Delete ${KIND_LABELS[event.kind]} at ${formatTimecode(event.t, fps)}`}
                      onClick={() => deleteEvent(event)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={3}
                maxLength={1000}
                value={notes}
                placeholder="Grip, setup reads, what to change next time"
                onChange={(e) => setNotes(e.target.value)}
                onBlur={saveNotes}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <SummaryPanel summary={summary} opponentName={opponentName} fps={fps} />
          <p className="text-xs text-muted-foreground">
            Response times are estimated from your first-strike tags, not a measured reaction test. Everything saves to this
            browser automatically.
          </p>
        </div>
      </div>
    </div>
  );
}

function PlayheadRound({ timeStore, roundAt }: { timeStore: TimeStore; roundAt: (t: number) => number }) {
  const t = useTime(timeStore);
  return <span className="text-xs text-muted-foreground">Round {roundAt(t)} at playhead</span>;
}

function SummaryPanel({ summary, opponentName, fps }: { summary: MatchSummary; opponentName: string; fps: number }) {
  const marked = summary.athlete_initiations + summary.opponent_initiations;
  const sharePct = summary.athlete_share === null ? null : Math.round(summary.athlete_share * 100);
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Match summary</CardTitle>
          <CardDescription>
            {summary.exchanges.length} exchange{summary.exchanges.length === 1 ? "" : "s"} · {summary.event_count} tags
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Who initiated</span>
              <span className="font-mono tabular-nums">
                {summary.athlete_initiations} : {summary.opponent_initiations}
              </span>
            </div>
            <div className="flex h-2 overflow-hidden rounded bg-muted" role="img" aria-label={`You initiated ${summary.athlete_initiations}, opponent ${summary.opponent_initiations}`}>
              {sharePct !== null && <div className="bg-brand" style={{ width: `${sharePct}%` }} />}
              <div className="flex-1 bg-zinc-600/70" />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>You {sharePct === null ? "—" : `${sharePct}%`}</span>
              <span>{opponentName}</span>
            </div>
            {summary.unmarked_exchanges > 0 && (
              <p className="text-xs text-muted-foreground">
                {summary.unmarked_exchanges} exchange{summary.unmarked_exchanges === 1 ? "" : "s"} without an initiator tag.
              </p>
            )}
            {marked === 0 && <p className="text-xs text-muted-foreground">Tag who starts each exchange to see your share.</p>}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-muted/50 px-2 py-1.5">
              <p className="text-muted-foreground">First strikes</p>
              <p className="font-mono tabular-nums">
                You {summary.first_strikes.athlete} · {opponentName} {summary.first_strikes.opponent}
              </p>
            </div>
            <div className="rounded-md bg-muted/50 px-2 py-1.5">
              <p className="text-muted-foreground">Takedown attempts</p>
              <p className="font-mono tabular-nums">
                You {summary.takedowns.athlete} · {opponentName} {summary.takedowns.opponent}
              </p>
            </div>
          </div>

          <div className="space-y-1.5 text-xs">
            <p className="text-muted-foreground">Estimated response (exchange start → defender&apos;s first strike)</p>
            <SummaryStat label={`After you initiate — ${opponentName}`} stat={summary.time_to_first_strike.after_athlete_init} />
            <SummaryStat label={`After ${opponentName} initiates — you`} stat={summary.time_to_first_strike.after_opponent_init} />
          </div>

          {summary.rounds.length > 0 && summary.exchanges.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Per round</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-0.5 font-medium">Round</th>
                    <th className="py-0.5 text-right font-medium">Exch.</th>
                    <th className="py-0.5 text-right font-medium">You init</th>
                    <th className="py-0.5 text-right font-medium">{opponentName} init</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {summary.rounds.map((round) => (
                    <tr key={round.round} className="border-t border-border">
                      <td className="py-1">R{round.round}</td>
                      <td className="py-1 text-right">{round.exchanges}</td>
                      <td className="py-1 text-right text-brand">{round.athlete_initiations}</td>
                      <td className="py-1 text-right text-muted-foreground">{round.opponent_initiations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exchange timeline</CardTitle>
          <CardDescription>Oldest first, with the response inside each exchange.</CardDescription>
        </CardHeader>
        <CardContent className="max-h-96 space-y-2 overflow-y-auto">
          {summary.exchanges.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">Tag an exchange to build the timeline.</p>
          )}
          {summary.exchanges.map((exchange) => (
            <div key={exchange.id} className="rounded-md border border-border/70 px-2 py-1.5 text-xs">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono tabular-nums">{formatTimecode(exchange.start_t, fps)}</span>
                <span className="text-muted-foreground">R{exchange.round}</span>
                <span className={cn("font-medium", exchange.initiator === "athlete" ? "text-brand" : "text-muted-foreground")}>
                  {exchange.initiator === "athlete" ? "You" : exchange.initiator === "opponent" ? opponentName : "Unmarked"} initiated
                </span>
                {exchange.end_t !== null && (
                  <span className="ml-auto font-mono text-muted-foreground">{formatSeconds(exchange.end_t - exchange.start_t, 1)}</span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-muted-foreground">
                <span>
                  First strike:{" "}
                  {exchange.first_strike_side === "athlete"
                    ? "You"
                    : exchange.first_strike_side === "opponent"
                      ? opponentName
                      : "—"}{" "}
                  {exchange.time_to_first_strike !== null ? `· ${formatSeconds(exchange.time_to_first_strike, 2)} after start` : ""}
                </span>
                {exchange.takedown_attempts > 0 && <span>{exchange.takedown_attempts} takedown attempt{exchange.takedown_attempts === 1 ? "" : "s"}</span>}
                {exchange.positional_changes > 0 && <span>{exchange.positional_changes} position change{exchange.positional_changes === 1 ? "" : "s"}</span>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function SummaryStat({ label, stat }: { label: string; stat: { count: number; avg: number | null; median: number | null } }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="shrink-0 font-mono tabular-nums">
        {stat.avg === null ? "—" : `${formatSeconds(stat.avg, 2)} · n=${stat.count}`}
      </span>
    </div>
  );
}
