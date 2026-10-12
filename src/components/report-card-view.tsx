"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Download, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoPlayer, type PlayerHandle, type VideoSource } from "@/components/workspace/video-player";
import { createTimeStore } from "@/lib/time-store";
import { DEFAULT_FPS, RATING_COLORS, roundLabel } from "@/lib/constants";
import { formatShort } from "@/lib/timecode";
import { cn } from "@/lib/utils";
import type { PublicCard } from "@/lib/card";
import type { AttributeRow, PullerSummary, Verdict } from "@/lib/verdict";

const VERDICT_LABEL: Record<Verdict, string> = { green: "Good", red: "Bad", black: "Neutral", unrated: "Unrated" };

export function ReportCardView({ card, preview = false }: { card: PublicCard; preview?: boolean }) {
  const player = useRef<PlayerHandle>(null);
  const videoBox = useRef<HTMLDivElement>(null);
  const [timeStore] = useState(createTimeStore);
  const m = card.match;
  const fps = m.fps || DEFAULT_FPS;

  const source: VideoSource | null = preview
    ? null
    : m.source_type === "youtube" && m.youtube_id
      ? { kind: "youtube", videoId: m.youtube_id }
      : card.videoUrl
        ? { kind: "upload", url: card.videoUrl }
        : null;
  const [videoSource] = useState(source);

  function jump(t: number) {
    if (!player.current) return;
    videoBox.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    player.current.seek(t);
    player.current.play();
  }

  return (
    <div className={cn("mx-auto w-full max-w-6xl space-y-6", !preview && "p-4 sm:p-8")}>
      {!preview && (
        <div className="flex items-center justify-between">
          <Link href="/" className="font-display text-lg font-bold tracking-wide uppercase">
            Pull<span className="text-brand">Scope</span>
          </Link>
          <Button variant="outline" size="sm" asChild>
            <a href={`/card/${card.slug}/png?download=1`} download={`pullscope-${card.slug}.png`}>
              <Download /> PNG
            </a>
          </Button>
        </div>
      )}

      <header className="overflow-hidden rounded-xl border bg-panel">
        <div className="grid gap-0 md:grid-cols-[1fr_minmax(0,420px)]">
          <div className="space-y-3 p-6">
            {m.event_name && <p className="text-xs font-semibold tracking-[0.2em] text-brand uppercase">{m.event_name}</p>}
            <h1 className="font-display text-4xl leading-none font-extrabold uppercase sm:text-5xl">
              {m.left_puller} <span className="text-brand">vs</span> {m.right_puller}
            </h1>
            <p className="text-sm text-muted-foreground">{m.title}</p>
            <VerdictSummary left={card.left} right={card.right} />
          </div>
          {card.thumbnail && !videoSource && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.thumbnail} alt="" className="hidden h-full w-full object-cover md:block" />
          )}
        </div>
      </header>

      {videoSource && (
        <div ref={videoBox} className="mx-auto max-w-4xl">
          <VideoPlayer ref={player} source={videoSource} fps={fps} timeStore={timeStore} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <PullerTable summary={card.left} fps={fps} frameUrls={card.frameUrls} onJump={videoSource ? jump : undefined} />
        <PullerTable summary={card.right} fps={fps} frameUrls={card.frameUrls} onJump={videoSource ? jump : undefined} />
      </div>

      {!preview && (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm text-muted-foreground">
          <span>
            Analysis{card.ownerHandle ? ` by ${card.ownerHandle.replace(/-[a-f0-9]{4}$/, "")}` : ""} · made with{" "}
            <Link href="/" className="font-semibold text-brand">
              PullScope
            </Link>
          </span>
          <Link href="/login?mode=signup" className="text-foreground hover:text-brand">
            Score your own matches →
          </Link>
        </footer>
      )}
    </div>
  );
}

function VerdictSummary({ left, right }: { left: PullerSummary; right: PullerSummary }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2">
      {[left, right].map((s, i) => (
        <div key={s.side} className="flex items-center gap-3">
          {i === 1 && <span className="hidden text-muted-foreground sm:inline">|</span>}
          <span className="font-semibold">{s.name}</span>
          <Tally color={RATING_COLORS.green} n={s.totals.green} />
          <Tally color={RATING_COLORS.red} n={s.totals.red} />
          {s.totals.black > 0 && <Tally color={RATING_COLORS.black} n={s.totals.black} />}
        </div>
      ))}
    </div>
  );
}

function Tally({ color, n }: { color: string; n: number }) {
  return (
    <span className="flex items-center gap-1 font-display text-2xl font-bold tabular-nums">
      {n}
      <span className="size-3.5 rounded-full ring-1 ring-white/20" style={{ background: color }} />
    </span>
  );
}

function PullerTable({
  summary,
  fps,
  frameUrls,
  onJump,
}: {
  summary: PullerSummary;
  fps: number;
  frameUrls: Record<string, string>;
  onJump?: (t: number) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-panel">
      <div className="flex items-baseline justify-between border-b px-4 py-3">
        <h2 className="font-display text-2xl font-bold uppercase">{summary.name}</h2>
        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{summary.side} puller</span>
      </div>
      <ul className="divide-y">
        {summary.rows.map((row) => (
          <Row key={row.attribute.id} row={row} fps={fps} frameUrls={frameUrls} onJump={onJump} />
        ))}
      </ul>
    </section>
  );
}

function Row({ row, frameUrls, onJump }: { row: AttributeRow; fps: number; frameUrls: Record<string, string>; onJump?: (t: number) => void }) {
  const [open, setOpen] = useState(false);
  const has = row.evidence.length > 0;
  return (
    <li>
      <button
        type="button"
        disabled={!has}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm enabled:hover:bg-accent"
      >
        <span className="min-w-0 flex-1 truncate">{row.attribute.name}</span>
        <span className="flex gap-2 font-mono text-xs">
          {(["green", "red", "black"] as const).map((r) => (
            <span key={r} className={row.counts[r] ? "" : "opacity-25"} style={{ color: r === "black" ? "#a1a1aa" : RATING_COLORS[r] }}>
              {row.counts[r]}
            </span>
          ))}
        </span>
        <VerdictChip verdict={row.verdict} />
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", !has && "invisible", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="space-y-2 bg-background/50 px-4 py-2">
          {row.evidence.map((e) => (
            <li key={e.id} className="flex gap-3 text-sm">
              <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: RATING_COLORS[e.rating] }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs">
                  {onJump ? (
                    <button type="button" onClick={() => onJump(e.timestamp_sec)} className="flex items-center gap-1 font-mono text-brand hover:underline">
                      <Play className="size-3" /> {formatShort(e.timestamp_sec)}
                    </button>
                  ) : (
                    <span className="font-mono text-brand">{formatShort(e.timestamp_sec)}</span>
                  )}
                  <span className="text-muted-foreground">{roundLabel(e.round_number)}</span>
                </div>
                {e.note && <p>{e.note}</p>}
              </div>
              {e.frame_path && frameUrls[e.frame_path] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={frameUrls[e.frame_path]} alt="" className="h-14 w-24 shrink-0 rounded object-cover" loading="lazy" />
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function VerdictChip({ verdict }: { verdict: Verdict }) {
  const color = verdict === "unrated" ? undefined : RATING_COLORS[verdict];
  return (
    <span
      className={cn(
        "w-20 rounded px-2 py-0.5 text-center text-xs font-semibold uppercase",
        verdict === "unrated" ? "border border-dashed text-muted-foreground" : "text-white",
      )}
      style={color ? { background: color } : undefined}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  );
}
