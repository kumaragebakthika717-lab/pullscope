"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChartConfiguration } from "chart.js";
import { Clapperboard, Film, Info, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartCanvas } from "@/components/analysis/chart-canvas";
import { MatchSetup } from "@/components/analysis/matches/match-setup";
import { MatchEditor } from "@/components/analysis/matches/match-editor";
import { MatchDetailsDialog } from "@/components/analysis/matches/match-details-dialog";
import { deleteMatchAnalysis, getVideo, listMatchAnalyses, putVideo, saveMatchAnalysis } from "@/lib/analysis/store";
import { summarizeMatch } from "@/lib/analysis/match";
import { formatDate, formatSeconds } from "@/lib/analysis/format";
import type { MatchAnalysis } from "@/lib/analysis/types";

export function MatchesWorkspace() {
  const [analyses, setAnalyses] = useState<MatchAnalysis[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [active, setActive] = useState<MatchAnalysis | null>(null);
  const [creating, setCreating] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const openToken = useRef(0);

  const replaceUrl = useCallback((url: string | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = url;
    setVideoUrl(url);
  }, []);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const rows = await listMatchAnalyses();
      setAnalyses(rows);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
      setAnalyses([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(analysis: MatchAnalysis) {
    const token = ++openToken.current;
    setCreating(false);
    setActive(analysis);
    replaceUrl(null);
    if (!analysis.video_stored) return;
    try {
      const blob = await getVideo(analysis.id);
      if (token !== openToken.current) return;
      if (blob) replaceUrl(URL.createObjectURL(blob));
      else toast.warning("The stored video is missing from this browser. Load the file again to review it.");
    } catch (e) {
      if (token === openToken.current) toast.error((e as Error).message);
    }
  }

  function closeEditor() {
    openToken.current += 1;
    setDetailsOpen(false);
    setActive(null);
    replaceUrl(null);
  }

  function persist(next: MatchAnalysis) {
    setActive(next);
    setAnalyses((prev) => (prev ? prev.map((analysis) => (analysis.id === next.id ? next : analysis)) : prev));
    void saveMatchAnalysis(next).catch((e: Error) => toast.error(`Could not save locally: ${e.message}`));
  }

  async function attachVideo(file: File, keep: boolean) {
    if (!active) return;
    const target = active;
    replaceUrl(URL.createObjectURL(file));
    let stored = false;
    if (keep) {
      try {
        await putVideo(target.id, file);
        stored = true;
      } catch (e) {
        toast.warning(`Couldn't keep the video (${(e as Error).message}). It plays now, but reattach it next time.`);
      }
    }
    persist({
      ...target,
      video_name: file.name,
      video_stored: stored,
      updated_at: new Date().toISOString(),
    });
  }

  async function remove(analysis: MatchAnalysis) {
    if (!window.confirm(`Delete "${analysis.title}" and its tags from this device? This cannot be undone.`)) return;
    try {
      await deleteMatchAnalysis(analysis.id);
      setAnalyses((prev) => (prev ? prev.filter((item) => item.id !== analysis.id) : prev));
      if (active?.id === analysis.id) closeEditor();
      toast.success("Match analysis deleted.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const rows = useMemo(() => analyses ?? [], [analyses]);
  const dateRows = useMemo(
    () => [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)),
    [rows],
  );
  const summaries = useMemo(() => new Map(rows.map((analysis) => [analysis.id, summarizeMatch(analysis)])), [rows]);
  const markedRows = useMemo(
    () => rows.filter((analysis) => (summaries.get(analysis.id)?.athlete_share ?? null) !== null),
    [rows, summaries],
  );
  const totalTags = useMemo(() => rows.reduce((sum, analysis) => sum + (summaries.get(analysis.id)?.event_count ?? 0), 0), [rows, summaries]);
  const averageShare = useMemo(() => {
    if (!markedRows.length) return null;
    const total = markedRows.reduce((sum, analysis) => sum + (summaries.get(analysis.id)!.athlete_share ?? 0), 0);
    return (total / markedRows.length) * 100;
  }, [markedRows, summaries]);

  const shareChart = useMemo<ChartConfiguration | null>(() => {
    const points = [...markedRows].sort((a, b) => a.date.localeCompare(b.date));
    if (!points.length) return null;
    return {
      type: "line",
      data: {
        labels: points.map((analysis) => formatDate(analysis.date)),
        datasets: [
          {
            label: "You initiated",
            data: points.map((analysis) => Math.round((summaries.get(analysis.id)!.athlete_share ?? 0) * 1000) / 10),
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
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${Number(ctx.parsed.y).toFixed(1)}% of marked exchanges`,
              afterLabel: (ctx) => points[ctx.dataIndex]?.title ?? "",
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
          y: {
            min: 0,
            max: 100,
            ticks: { callback: (value) => `${value}%` },
            title: { display: true, text: "share of exchanges you initiated" },
          },
        },
      },
    };
  }, [markedRows, summaries]);

  if (active) {
    return (
      <>
        <MatchEditor
          key={active.id}
          analysis={active}
          videoUrl={videoUrl}
          onChange={persist}
          onClose={closeEditor}
          onEditDetails={() => setDetailsOpen(true)}
          onDelete={() => void remove(active)}
          onAttachVideo={attachVideo}
        />
        <MatchDetailsDialog open={detailsOpen} analysis={active} onOpenChange={setDetailsOpen} onSave={persist} />
      </>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Performance analysis</p>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Match tagging</h1>
          <p className="text-sm text-muted-foreground">
            Tag who starts each exchange frame by frame, then compare how your initiation and response change across matches.
          </p>
        </div>
        {!creating && (
          <Button className="font-semibold" onClick={() => setCreating(true)}>
            <Plus /> New analysis
          </Button>
        )}
      </header>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="size-3.5 shrink-0" />
        Videos and tags stay in this browser (IndexedDB). Nothing is uploaded and no AI inference is called.
      </p>

      {creating && (
        <MatchSetup
          onCreated={(analysis, url) => {
            setAnalyses((prev) => [analysis, ...(prev ?? [])]);
            setActive(analysis);
            replaceUrl(url);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {loadError && (
        <Card className="border-bad/40">
          <CardHeader>
            <CardTitle className="text-base">Local storage unavailable</CardTitle>
            <CardDescription>{loadError}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {analyses === null && !creating && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Reading local analyses…
        </div>
      )}

      {analyses !== null && rows.length === 0 && !creating && (
        <div className="grid place-items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <Film className="size-10 text-muted-foreground" />
          <div>
            <p className="font-semibold">No match analyses yet</p>
            <p className="text-sm text-muted-foreground">Load a match video, step through it and tag the exchanges.</p>
          </div>
          <Button variant="outline" onClick={() => setCreating(true)}>
            <Clapperboard /> Analyse your first match
          </Button>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card size="sm">
              <CardHeader>
                <CardDescription>Matches analysed</CardDescription>
                <CardTitle className="font-display text-2xl">{rows.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardDescription>Tags logged</CardDescription>
                <CardTitle className="font-display text-2xl">{totalTags}</CardTitle>
              </CardHeader>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardDescription>Average initiation share</CardDescription>
                <CardTitle className="font-display text-2xl">{averageShare === null ? "—" : `${averageShare.toFixed(0)}%`}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {markedRows.length ? `Across ${markedRows.length} match${markedRows.length === 1 ? "" : "es"} with initiation tags` : "Tag initiations to see this"}
              </CardContent>
            </Card>
          </div>

          {shareChart ? (
            <Card>
              <CardHeader>
                <CardTitle>Initiation share over time</CardTitle>
                <CardDescription>Share of marked exchanges you started, match by match.</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartCanvas config={shareChart} ariaLabel="Your share of initiated exchanges over your saved matches" className="h-52" />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Initiation trend</CardTitle>
                <CardDescription>Tag who initiates an exchange inside a match to unlock the cross-match chart.</CardDescription>
              </CardHeader>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Cross-match comparison</CardTitle>
              <CardDescription>Key numbers from every saved match, newest first.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-3 font-medium">Match</th>
                    <th className="py-1 pr-3 font-medium">Date</th>
                    <th className="py-1 pr-3 text-right font-medium">Exchanges</th>
                    <th className="py-1 pr-3 text-right font-medium">You initiated</th>
                    <th className="py-1 pr-3 text-right font-medium">Opponent</th>
                    <th className="py-1 pr-3 text-right font-medium">Your first strikes</th>
                    <th className="py-1 text-right font-medium">Their response after you start</th>
                  </tr>
                </thead>
                <tbody>
                  {dateRows.map((analysis) => {
                    const summary = summaries.get(analysis.id)!;
                    return (
                      <tr key={analysis.id} className="border-t border-border">
                        <td className="max-w-64 truncate py-1.5 pr-3">
                          <button type="button" className="text-left hover:text-brand" onClick={() => void open(analysis)}>
                            {analysis.title}
                          </button>
                          {analysis.opponent && <span className="text-muted-foreground"> · vs {analysis.opponent}</span>}
                        </td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{formatDate(analysis.date)}</td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{summary.exchanges.length}</td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-brand">{summary.athlete_initiations}</td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{summary.opponent_initiations}</td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{summary.first_strikes.athlete}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">
                          {summary.time_to_first_strike.after_athlete_init.avg === null
                            ? "—"
                            : `${formatSeconds(summary.time_to_first_strike.after_athlete_init.avg, 2)} · n=${summary.time_to_first_strike.after_athlete_init.count}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((analysis) => {
              const summary = summaries.get(analysis.id)!;
              const share = summary.athlete_share === null ? null : Math.round(summary.athlete_share * 100);
              return (
                <Card key={analysis.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">{analysis.title}</CardTitle>
                      <Badge variant="outline" className="shrink-0">
                        {analysis.fps} fps
                      </Badge>
                    </div>
                    <CardDescription>
                      {formatDate(analysis.date)}
                      {analysis.opponent ? ` · vs ${analysis.opponent}` : ""}
                      {analysis.event_name ? ` · ${analysis.event_name}` : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-3">
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{summary.exchanges.length} exchanges</span>
                      <span>{summary.event_count} tags</span>
                      <span>{share === null ? "no initiations" : `${share}% you initiated`}</span>
                      {analysis.duration_sec ? <span>{formatSeconds(analysis.duration_sec, 0)} long</span> : null}
                    </div>
                    <div className="mt-auto flex items-center gap-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => void open(analysis)}>
                        Open
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Delete ${analysis.title}`}
                        onClick={() => void remove(analysis)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
