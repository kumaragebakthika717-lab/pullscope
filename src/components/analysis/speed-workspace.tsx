"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Info,
  Loader2,
  Pencil,
  Plus,
  Timer,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { ChartConfiguration } from "chart.js";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartCanvas } from "@/components/analysis/chart-canvas";
import { SpeedSessionDialog } from "@/components/analysis/speed-session-dialog";
import { deleteSpeedSession, listSpeedSessions } from "@/lib/analysis/store";
import {
  compareSessions,
  sessionMetrics,
  trendSeries,
  type EffortBasis,
  type SessionMetrics,
  type TrendMetric,
} from "@/lib/analysis/metrics";
import { formatDate, formatDistance, formatPct, formatSeconds } from "@/lib/analysis/format";
import type { SpeedSession } from "@/lib/analysis/types";
import { cn } from "@/lib/utils";

const METRIC_LABELS: Record<TrendMetric, string> = {
  avg_effort: "Average effort",
  best_effort: "Best interval",
  work_sec: "Total work time",
};

const DISCIPLINE_LABELS = { sprint: "Sprints", rounds: "Rounds", distance: "Distance" } as const;

function effortLabel(basis: EffortBasis, value: string) {
  return basis === "distance" ? `${value} /100m` : `${value} /interval`;
}

function trendColor(value: number | null, lowerIsBetter = true): string {
  if (value === null || Math.abs(value) < 0.05) return "text-muted-foreground";
  const good = lowerIsBetter ? value < 0 : value > 0;
  return good ? "text-good" : "text-bad";
}

function trendWord(value: number | null, lowerIsBetter = true): string {
  if (value === null || Math.abs(value) < 0.05) return "unchanged";
  const good = lowerIsBetter ? value < 0 : value > 0;
  return good ? "better" : "worse";
}

export function SpeedWorkspace() {
  const [sessions, setSessions] = useState<SpeedSession[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SpeedSession | null>(null);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("avg_effort");
  const [basisChoice, setBasisChoice] = useState<EffortBasis | null>(null);
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");
  const [fatigueId, setFatigueId] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const rows = await listSpeedSessions();
      setSessions(rows);
      setLoadError(null);
      setCompareA((current) => (current && rows.some((s) => s.id === current) ? current : (rows[1]?.id ?? "")));
      setCompareB((current) => (current && rows.some((s) => s.id === current) ? current : (rows[0]?.id ?? "")));
      setFatigueId((current) => (current && rows.some((s) => s.id === current) ? current : (rows[0]?.id ?? "")));
    } catch (e) {
      setLoadError((e as Error).message);
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => sessions ?? [], [sessions]);
  const latest = rows[0] ?? null;
  const previous = rows[1] ?? null;
  const latestMetrics = latest ? sessionMetrics(latest) : null;
  const previousMetrics = previous ? sessionMetrics(previous) : null;

  const basisCounts = useMemo(() => {
    let distance = 0;
    let interval = 0;
    for (const session of rows) {
      const metrics = sessionMetrics(session);
      if (!metrics) continue;
      if (metrics.basis === "distance") distance += 1;
      else interval += 1;
    }
    return { distance, interval };
  }, [rows]);

  const basis: EffortBasis = basisChoice ?? (basisCounts.distance >= basisCounts.interval ? "distance" : "interval");

  const speedDelta =
    latestMetrics && previousMetrics && latestMetrics.basis === previousMetrics.basis && previousMetrics.avg_effort > 0
      ? ((latestMetrics.avg_effort - previousMetrics.avg_effort) / previousMetrics.avg_effort) * 100
      : null;
  const latestFade = latestMetrics?.fade_pct ?? null;
  const previousFade = previousMetrics?.fade_pct ?? null;
  const fadeDelta = latestFade !== null && previousFade !== null ? latestFade - previousFade : null;

  const trendPoints = useMemo(() => trendSeries(rows, trendMetric), [rows, trendMetric]);
  const visibleTrend = trendMetric === "work_sec" ? trendPoints : trendPoints.filter((point) => point.basis === basis);
  const hiddenTrend = trendPoints.length - visibleTrend.length;

  const trendChart = useMemo<ChartConfiguration>(() => {
    const isTime = trendMetric === "work_sec";
    const unit = isTime ? "work time" : basis === "distance" ? "per 100 m" : "per interval";
    return {
      type: "line",
      data: {
        labels: visibleTrend.map((point) => formatDate(point.date)),
        datasets: [
          {
            label: METRIC_LABELS[trendMetric],
            data: visibleTrend.map((point) => Number(point.value.toFixed(3))),
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.12)",
            fill: true,
            tension: 0.25,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: "#f59e0b",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${formatSeconds(Number(ctx.parsed.y))} ${unit}`,
              afterLabel: (ctx) => visibleTrend[ctx.dataIndex]?.title ?? "",
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
          y: {
            beginAtZero: false,
            ticks: { callback: (value) => formatSeconds(Number(value), 0) },
            title: { display: true, text: isTime ? "work time" : basis === "distance" ? "seconds / 100 m" : "seconds / interval" },
          },
        },
      },
    };
  }, [visibleTrend, trendMetric, basis]);

  const fatigueSession = rows.find((session) => session.id === fatigueId) ?? latest;
  const fatigueMetrics = fatigueSession ? sessionMetrics(fatigueSession) : null;

  const fatigueChart = useMemo<ChartConfiguration | null>(() => {
    if (!fatigueMetrics) return null;
    const hasRest = fatigueMetrics.intervals.some((interval) => (interval.rest_sec ?? 0) > 0);
    const highlight = fatigueMetrics.fatigue_point?.index ?? -1;
    return {
      type: "bar",
      data: {
        labels: fatigueMetrics.intervals.map((interval) => `#${interval.index}`),
        datasets: [
          ...(hasRest
            ? [
                {
                  type: "bar" as const,
                  label: "Rest after (s)",
                  data: fatigueMetrics.intervals.map((interval) => interval.rest_sec ?? 0),
                  backgroundColor: "rgba(161, 161, 170, 0.22)",
                  borderColor: "rgba(161, 161, 170, 0.45)",
                  borderWidth: 1,
                  borderRadius: 3,
                  yAxisID: "rest",
                  order: 3,
                },
              ]
            : []),
          {
            type: "line" as const,
            label: fatigueMetrics.basis === "distance" ? "Pace (s/100m)" : "Effort (s)",
            data: fatigueMetrics.intervals.map((interval) => Number(interval.effort.toFixed(3))),
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.15)",
            tension: 0.2,
            yAxisID: "effort",
            order: 1,
            pointRadius: fatigueMetrics.intervals.map((interval) => (interval.index === highlight ? 6 : 3)),
            pointBackgroundColor: fatigueMetrics.intervals.map((interval) =>
              interval.index === highlight ? "#ef4444" : "#f59e0b",
            ),
            pointBorderColor: fatigueMetrics.intervals.map((interval) =>
              interval.index === highlight ? "#ef4444" : "#f59e0b",
            ),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: hasRest, labels: { boxWidth: 10, boxHeight: 10 } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const interval = fatigueMetrics.intervals[ctx.dataIndex];
                if (ctx.dataset.yAxisID === "rest") return `Rest ${formatSeconds(interval.rest_sec ?? 0, 0)}`;
                return `${formatSeconds(interval.effort)} ${fatigueMetrics.basis === "distance" ? "/100 m" : "per interval"}`;
              },
              afterBody: (items) => {
                const interval = fatigueMetrics.intervals[items[0]?.dataIndex ?? 0];
                if (!interval) return "";
                const change = interval.delta_pct === null ? "—" : formatPct(interval.delta_pct);
                return [`Time ${formatSeconds(interval.time_sec)}`, `vs previous ${change}`];
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false } },
          effort: {
            position: "left",
            beginAtZero: false,
            ticks: { callback: (value) => formatSeconds(Number(value), 1) },
            title: { display: true, text: fatigueMetrics.basis === "distance" ? "s / 100 m" : "seconds" },
          },
          rest: {
            position: "right",
            beginAtZero: true,
            display: hasRest,
            grid: { display: false },
            ticks: { callback: (value) => formatSeconds(Number(value), 0) },
            title: { display: true, text: "rest (s)" },
          },
        },
      },
    };
  }, [fatigueMetrics]);

  const sessionA = rows.find((session) => session.id === compareA) ?? null;
  const sessionB = rows.find((session) => session.id === compareB) ?? null;
  const comparison = sessionA && sessionB ? compareSessions(sessionA, sessionB) : null;

  const compareChart = useMemo<ChartConfiguration | null>(() => {
    if (!comparison?.a || !comparison.b) return null;
    const count = Math.max(comparison.a.intervals.length, comparison.b.intervals.length);
    const fill = (metrics: SessionMetrics) =>
      Array.from({ length: count }, (_, index) => {
        const interval = metrics.intervals[index];
        return interval ? Number(interval.effort.toFixed(3)) : null;
      });
    return {
      type: "line",
      data: {
        labels: Array.from({ length: count }, (_, index) => `#${index + 1}`),
        datasets: [
          {
            label: sessionA?.title ?? "Session A",
            data: fill(comparison.a),
            borderColor: "#22c55e",
            backgroundColor: "rgba(34, 197, 94, 0.12)",
            tension: 0.2,
            spanGaps: true,
            pointRadius: 3,
            pointBackgroundColor: "#22c55e",
          },
          {
            label: sessionB?.title ?? "Session B",
            data: fill(comparison.b),
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.12)",
            tension: 0.2,
            spanGaps: true,
            pointRadius: 3,
            pointBackgroundColor: "#f59e0b",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: true, labels: { boxWidth: 10, boxHeight: 10 } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${formatSeconds(Number(ctx.parsed.y))}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: false,
            ticks: { callback: (value) => formatSeconds(Number(value), 1) },
            title: { display: true, text: comparison.a.basis === "distance" ? "s / 100 m" : "seconds / interval" },
          },
        },
      },
    };
  }, [comparison, sessionA, sessionB]);

  async function remove(session: SpeedSession) {
    if (!window.confirm(`Delete "${session.title}" from this device? This cannot be undone.`)) return;
    try {
      await deleteSpeedSession(session.id);
      toast.success("Session deleted.");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Performance analysis</p>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Speed &amp; endurance</h1>
          <p className="text-sm text-muted-foreground">
            Sprint and round metrics, trend charts and side-by-side session comparison.
          </p>
        </div>
        <Button
          className="font-semibold"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus /> Log session
        </Button>
      </header>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="size-3.5 shrink-0" />
        Everything here is stored in this browser (IndexedDB). Nothing is uploaded or sent to a server.
      </p>

      {loadError && (
        <Card className="border-bad/40">
          <CardHeader>
            <CardTitle className="text-base">Local storage unavailable</CardTitle>
            <CardDescription>{loadError}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {sessions === null && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Reading local sessions…
        </div>
      )}

      {sessions !== null && rows.length === 0 && (
        <div className="grid place-items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <Activity className="size-10 text-muted-foreground" />
          <div>
            <p className="font-semibold">No sessions logged yet</p>
            <p className="text-sm text-muted-foreground">Log sprints or rounds to start tracking pace and fatigue.</p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus /> Log your first session
          </Button>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card size="sm">
              <CardHeader>
                <CardDescription>Sessions logged</CardDescription>
                <CardTitle className="font-display text-2xl">{rows.length}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">Across all disciplines on this device</CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardDescription>Latest average effort</CardDescription>
                <CardTitle className="text-xl tabular-nums">
                  {latestMetrics ? effortLabel(latestMetrics.basis, formatSeconds(latestMetrics.avg_effort)) : "—"}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {latest ? `${formatDate(latest.date)} · ${latest.title}` : ""}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardDescription>Speed vs previous</CardDescription>
                <CardTitle className={cn("flex items-center gap-1.5 text-xl tabular-nums", trendColor(speedDelta))}>
                  {speedDelta === null ? null : speedDelta < 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                  {speedDelta === null ? "—" : formatPct(speedDelta)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {speedDelta === null ? "Needs two sessions on the same basis" : `${Math.abs(speedDelta).toFixed(1)}% ${speedDelta < 0 ? "faster" : "slower"} than ${formatDate(previous!.date)}`}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardDescription>Latest fade</CardDescription>
                <CardTitle className={cn("flex items-center gap-1.5 text-xl tabular-nums", trendColor(fadeDelta ?? latestMetrics?.fade_pct ?? null))}>
                  <Timer className="size-4" />
                  {latestMetrics?.fade_pct === null || latestMetrics?.fade_pct === undefined ? "—" : formatPct(latestMetrics.fade_pct)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {fadeDelta === null
                  ? "Second half vs first half effort"
                  : `${Math.abs(fadeDelta).toFixed(1)} pp ${trendWord(fadeDelta)} than the session before`}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>Trend over time</CardTitle>
                  <CardDescription>Lower is faster. Dates are the session dates you logged.</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {trendMetric !== "work_sec" && (
                    <div className="flex rounded-md bg-muted p-0.5" role="group" aria-label="Effort basis">
                      {(["distance", "interval"] as EffortBasis[]).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setBasisChoice(option)}
                          className={cn(
                            "rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors",
                            basis === option && "bg-background text-foreground",
                          )}
                        >
                          {option === "distance" ? `Per 100 m (${basisCounts.distance})` : `Per interval (${basisCounts.interval})`}
                        </button>
                      ))}
                    </div>
                  )}
                  <Select value={trendMetric} onValueChange={(value) => setTrendMetric(value as TrendMetric)}>
                    <SelectTrigger size="sm" className="w-40" aria-label="Trend metric">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="avg_effort">Average effort</SelectItem>
                      <SelectItem value="best_effort">Best interval</SelectItem>
                      <SelectItem value="work_sec">Total work time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {visibleTrend.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No sessions match this metric yet.</p>
              ) : (
                <ChartCanvas config={trendChart} ariaLabel={`${METRIC_LABELS[trendMetric]} across ${visibleTrend.length} sessions`} />
              )}
              {hiddenTrend > 0 && trendMetric !== "work_sec" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {hiddenTrend} session{hiddenTrend === 1 ? "" : "s"} logged without distances {hiddenTrend === 1 ? "is" : "are"} hidden here — switch
                  the basis to see them.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Fatigue within a session</CardTitle>
                <CardDescription>Pace per interval. The red point is the biggest slowdown (fatigue point).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={fatigueSession?.id ?? ""} onValueChange={setFatigueId}>
                  <SelectTrigger className="w-full" aria-label="Session for fatigue chart">
                    <SelectValue placeholder="Choose a session" />
                  </SelectTrigger>
                  <SelectContent>
                    {rows.map((session) => (
                      <SelectItem key={session.id} value={session.id}>
                        {formatDate(session.date)} · {session.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fatigueChart && fatigueMetrics ? (
                  <>
                    <ChartCanvas config={fatigueChart} ariaLabel={`Effort per interval for ${fatigueSession?.title ?? "session"}`} />
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-md bg-muted/50 px-2 py-1.5">
                        <p className="text-muted-foreground">Work</p>
                        <p className="font-mono tabular-nums">{formatSeconds(fatigueMetrics.work_sec, 0)}</p>
                      </div>
                      <div className="rounded-md bg-muted/50 px-2 py-1.5">
                        <p className="text-muted-foreground">Rest</p>
                        <p className="font-mono tabular-nums">{formatSeconds(fatigueMetrics.rest_sec, 0)}</p>
                      </div>
                      <div className="rounded-md bg-muted/50 px-2 py-1.5">
                        <p className="text-muted-foreground">Fatigue point</p>
                        <p className="font-mono tabular-nums">
                          {fatigueMetrics.fatigue_point ? `#${fatigueMetrics.fatigue_point.index} (${formatPct(fatigueMetrics.fatigue_point.delta_pct)})` : "none"}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">This session has no intervals.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Compare two sessions</CardTitle>
                <CardDescription>A is the baseline, B is the newer session you want to check.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select value={sessionA?.id ?? ""} onValueChange={setCompareA}>
                    <SelectTrigger className="w-full" aria-label="Baseline session">
                      <SelectValue placeholder="Session A" />
                    </SelectTrigger>
                    <SelectContent>
                      {rows.map((session) => (
                        <SelectItem key={session.id} value={session.id}>
                          A · {formatDate(session.date)} · {session.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={sessionB?.id ?? ""} onValueChange={setCompareB}>
                    <SelectTrigger className="w-full" aria-label="Comparison session">
                      <SelectValue placeholder="Session B" />
                    </SelectTrigger>
                    <SelectContent>
                      {rows.map((session) => (
                        <SelectItem key={session.id} value={session.id}>
                          B · {formatDate(session.date)} · {session.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {comparison?.a && comparison.b ? (
                  comparison.comparison.comparable && compareChart ? (
                    <>
                      <ChartCanvas config={compareChart} ariaLabel="Interval effort for the two selected sessions" className="h-44" />
                      <ComparisonTable a={comparison.a} b={comparison.b} comparison={comparison.comparison} />
                      <ComparisonVerdict comparison={comparison.comparison} />
                    </>
                  ) : (
                    <p className="rounded-md border border-brand/30 bg-brand/5 px-3 py-2 text-xs text-muted-foreground">
                      These sessions use different effort bases — one has distances, the other doesn&apos;t. Add distances to compare pace, or use
                      total work time in the trend chart.
                    </p>
                  )
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">Pick two sessions to compare.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Session log</CardTitle>
              <CardDescription>{rows.length} saved on this device.</CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {rows.map((session) => {
                const metrics = sessionMetrics(session);
                return (
                  <div key={session.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{session.title}</p>
                        <Badge variant="outline" className="text-[0.65rem] uppercase">
                          {DISCIPLINE_LABELS[session.discipline]}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(session.date)} · {metrics ? `${metrics.count} intervals` : "no intervals"}
                        {metrics?.total_distance_m ? ` · ${formatDistance(metrics.total_distance_m)}` : ""}
                        {metrics?.fade_pct !== null && metrics ? ` · fade ${formatPct(metrics.fade_pct)}` : ""}
                      </p>
                    </div>
                    {metrics && (
                      <span className="font-mono text-sm tabular-nums text-muted-foreground">
                        {effortLabel(metrics.basis, formatSeconds(metrics.avg_effort))}
                      </span>
                    )}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${session.title}`}
                        onClick={() => {
                          setEditing(session);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${session.title}`} onClick={() => remove(session)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}

      <SpeedSessionDialog
        open={dialogOpen}
        session={editing}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        onSaved={() => void load()}
      />
    </div>
  );
}

function ComparisonTable({
  a,
  b,
  comparison,
}: {
  a: SessionMetrics;
  b: SessionMetrics;
  comparison: ReturnType<typeof compareSessions>["comparison"];
}) {
  const effort = (metrics: SessionMetrics, value: number) => effortLabel(metrics.basis, formatSeconds(value));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1 font-medium">Metric</th>
            <th className="py-1 text-right font-medium">A</th>
            <th className="py-1 text-right font-medium">B</th>
            <th className="py-1 text-right font-medium">Change</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          <tr className="border-t border-border">
            <td className="py-1.5 font-sans">Intervals</td>
            <td className="py-1.5 text-right">{a.count}</td>
            <td className="py-1.5 text-right">{b.count}</td>
            <td className="py-1.5 text-right text-muted-foreground">{b.count - a.count > 0 ? "+" : ""}{b.count - a.count}</td>
          </tr>
          <tr className="border-t border-border">
            <td className="py-1.5 font-sans">Average effort</td>
            <td className="py-1.5 text-right">{effort(a, a.avg_effort)}</td>
            <td className="py-1.5 text-right">{effort(b, b.avg_effort)}</td>
            <td className={cn("py-1.5 text-right", trendColor(comparison.effort_delta_pct))}>{formatPct(comparison.effort_delta_pct)}</td>
          </tr>
          <tr className="border-t border-border">
            <td className="py-1.5 font-sans">Best interval</td>
            <td className="py-1.5 text-right">{effort(a, a.best_effort)}</td>
            <td className="py-1.5 text-right">{effort(b, b.best_effort)}</td>
            <td className="py-1.5 text-right text-muted-foreground">—</td>
          </tr>
          <tr className="border-t border-border">
            <td className="py-1.5 font-sans">Fade (first → second half)</td>
            <td className="py-1.5 text-right">{formatPct(a.fade_pct)}</td>
            <td className="py-1.5 text-right">{formatPct(b.fade_pct)}</td>
            <td className={cn("py-1.5 text-right", trendColor(comparison.fade_delta_pp))}>
              {comparison.fade_delta_pp === null ? "—" : `${comparison.fade_delta_pp > 0 ? "+" : ""}${comparison.fade_delta_pp.toFixed(1)} pp`}
            </td>
          </tr>
          <tr className="border-t border-border">
            <td className="py-1.5 font-sans">Consistency (lower = even)</td>
            <td className="py-1.5 text-right">{formatPct(a.consistency_cv_pct)}</td>
            <td className="py-1.5 text-right">{formatPct(b.consistency_cv_pct)}</td>
            <td className={cn("py-1.5 text-right", trendColor(comparison.consistency_delta_pp))}>
              {comparison.consistency_delta_pp === null ? "—" : `${comparison.consistency_delta_pp > 0 ? "+" : ""}${comparison.consistency_delta_pp.toFixed(1)} pp`}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ComparisonVerdict({ comparison }: { comparison: ReturnType<typeof compareSessions>["comparison"] }) {
  const speed = comparison.effort_delta_pct;
  const endurance = comparison.fade_delta_pp;
  const parts: string[] = [];
  if (speed !== null) {
    parts.push(
      speed < -0.05
        ? `Speed improved: B is ${Math.abs(speed).toFixed(1)}% faster on average.`
        : speed > 0.05
          ? `Speed dropped: B is ${speed.toFixed(1)}% slower on average.`
          : "Speed is unchanged.",
    );
  }
  if (endurance !== null) {
    parts.push(
      endurance < -0.05
        ? `Endurance improved: fade is ${Math.abs(endurance).toFixed(1)} pp smaller.`
        : endurance > 0.05
          ? `Endurance dropped: fade is ${endurance.toFixed(1)} pp larger.`
          : "Endurance is unchanged.",
    );
  }
  return <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{parts.join(" ") || "No comparable metrics."}</p>;
}
