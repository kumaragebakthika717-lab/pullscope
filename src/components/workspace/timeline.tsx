"use client";

import { useMemo, useRef, useState } from "react";
import { Flag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RATING_COLORS, roundLabel } from "@/lib/constants";
import { formatShort, formatTimecode } from "@/lib/timecode";
import { useTime, type TimeStore } from "@/lib/time-store";
import type { AnnotationWithFrame, PullerSide, RoundBoundary, RubricAttribute } from "@/lib/types";

export type Zoom = "full" | "round" | "30s";

type Props = {
  annotations: AnnotationWithFrame[];
  attributes: RubricAttribute[];
  rounds: RoundBoundary[];
  duration: number;
  fps: number;
  timeStore: TimeStore;
  leftName: string;
  rightName: string;
  activeSide: PullerSide;
  onSeek: (t: number) => void;
  onMarkRound: () => void;
  onDeleteRound: (r: RoundBoundary) => void;
};

export function Timeline(props: Props) {
  const { rounds, duration, timeStore, onMarkRound } = props;
  const [zoom, setZoom] = useState<Zoom>("full");
  const t = useTime(timeStore);

  const currentRound = useMemo(() => {
    let r: RoundBoundary | null = null;
    for (const b of rounds) if (b.start_sec <= t + 1e-3) r = b;
    return r;
  }, [rounds, t]);

  const view = useMemo((): [number, number] => {
    const total = Math.max(duration, 1);
    if (zoom === "round" && currentRound) {
      return [currentRound.start_sec, Math.max(currentRound.start_sec + 1, currentRound.end_sec ?? total)];
    }
    if (zoom === "30s") {
      const start = Math.min(Math.max(0, t - 15), Math.max(0, total - 30));
      return [start, Math.min(total, start + 30)];
    }
    return [0, total];
  }, [zoom, currentRound, duration, t]);

  return (
    <div className="space-y-2 rounded-lg border bg-panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Timeline</span>
        <div className="flex items-center gap-0.5 rounded-md bg-background p-0.5" role="group" aria-label="Timeline zoom">
          {(["full", "round", "30s"] as Zoom[]).map((z) => (
            <button
              key={z}
              type="button"
              disabled={z === "round" && !currentRound}
              onClick={() => setZoom(z)}
              title={z === "round" && !currentRound ? "Mark a round boundary first" : undefined}
              className={cn(
                "rounded px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40",
                zoom === z && "bg-accent text-foreground",
              )}
            >
              {z === "full" ? "Full match" : z === "round" ? (currentRound ? roundLabel(currentRound.round_number) : "Round") : "30 sec"}
            </button>
          ))}
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {formatShort(view[0])} – {formatShort(view[1])}
        </span>
        <Button size="xs" variant="outline" className="ml-auto" onClick={onMarkRound} disabled={!duration}>
          <Flag /> Mark round boundary
        </Button>
      </div>
      <TimelineBody {...props} view={view} t={t} />
    </div>
  );
}

function TimelineBody({
  annotations,
  attributes,
  rounds,
  fps,
  leftName,
  rightName,
  activeSide,
  onSeek,
  onDeleteRound,
  view,
  t,
}: Props & { view: [number, number]; t: number }) {
  const [hover, setHover] = useState<{ a: AnnotationWithFrame; x: number; lane: PullerSide } | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const [v0, v1] = view;
  const span = Math.max(0.001, v1 - v0);
  const pos = (sec: number) => ((sec - v0) / span) * 100;
  const inView = (sec: number) => sec >= v0 - 1e-6 && sec <= v1 + 1e-6;
  const attrName = useMemo(() => new Map(attributes.map((a) => [a.id, a.name])), [attributes]);

  function seekFromClick(e: React.MouseEvent) {
    const el = track.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    onSeek(v0 + ((e.clientX - rect.left) / rect.width) * span);
  }

  const lanes: { side: PullerSide; name: string }[] = [
    { side: "left", name: leftName },
    { side: "right", name: rightName },
  ];

  return (
    <div className="flex gap-2">
      <div className="flex w-28 shrink-0 flex-col justify-around pt-4 text-xs">
        {lanes.map((l) => (
          <span key={l.side} className={cn("truncate", activeSide === l.side ? "font-semibold text-brand" : "text-muted-foreground")} title={l.name}>
            {l.side === "left" ? "L" : "R"} · {l.name}
          </span>
        ))}
      </div>
      <div ref={track} className="relative flex-1 select-none" onMouseLeave={() => setHover(null)}>
        {/* Round markers row */}
        <div className="relative h-4">
          {rounds.filter((r) => inView(r.start_sec)).map((r) => (
            <button
              key={r.id}
              type="button"
              className="group absolute top-0 flex -translate-x-1/2 items-center gap-0.5 rounded bg-brand/20 px-1 text-[10px] leading-4 font-semibold text-brand hover:bg-bad/30 hover:text-bad"
              style={{ left: `${pos(r.start_sec)}%` }}
              onClick={() => onDeleteRound(r)}
              title={`Round ${r.round_number} starts at ${formatShort(r.start_sec)} — click to remove`}
            >
              R{r.round_number}
              <X className="hidden size-2.5 group-hover:block" />
            </button>
          ))}
        </div>

        <div className="relative cursor-pointer" onClick={seekFromClick}>
          {lanes.map((l) => (
            <div key={l.side} className={cn("relative my-1 h-7 rounded bg-background", activeSide === l.side && "ring-1 ring-brand/40")}>
              {annotations
                .filter((a) => a.puller_side === l.side && inView(a.timestamp_sec))
                .map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    aria-label={`${attrName.get(a.attribute_id) ?? "Annotation"} ${a.rating} at ${formatShort(a.timestamp_sec)}`}
                    className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black/60 transition-transform hover:z-10 hover:scale-150"
                    style={{ left: `${pos(a.timestamp_sec)}%`, background: RATING_COLORS[a.rating] }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeek(a.timestamp_sec);
                    }}
                    onMouseEnter={() => setHover({ a, x: pos(a.timestamp_sec), lane: l.side })}
                    onMouseLeave={() => setHover(null)}
                  />
                ))}
            </div>
          ))}

          {/* Round boundary lines */}
          {rounds.filter((r) => inView(r.start_sec)).map((r) => (
            <div key={r.id} className="pointer-events-none absolute inset-y-0 w-px bg-brand/50" style={{ left: `${pos(r.start_sec)}%` }} />
          ))}

          {/* Playhead */}
          {inView(t) && (
            <div className="pointer-events-none absolute -inset-y-1 w-0.5 bg-foreground" style={{ left: `${pos(t)}%` }} />
          )}
        </div>

        {hover && (
          <div
            className="pointer-events-none absolute z-20 w-56 -translate-x-1/2 rounded-md border bg-popover p-2 text-xs shadow-lg"
            style={{ left: `${Math.min(88, Math.max(12, hover.x))}%`, bottom: hover.lane === "left" ? "100%" : undefined, top: hover.lane === "right" ? "100%" : undefined }}
          >
            <div className="flex items-center gap-1.5 font-semibold">
              <span className="size-2.5 rounded-full" style={{ background: RATING_COLORS[hover.a.rating] }} />
              {attrName.get(hover.a.attribute_id) ?? "Removed attribute"}
              <span className="ml-auto font-mono font-normal text-muted-foreground">{formatTimecode(hover.a.timestamp_sec, fps)}</span>
            </div>
            <div className="mt-0.5 text-muted-foreground">{roundLabel(hover.a.round_number)}</div>
            {hover.a.note && <p className="mt-1 line-clamp-3">{hover.a.note}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
