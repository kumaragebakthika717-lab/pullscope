"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { PLAYBACK_RATES } from "@/lib/constants";
import { formatTimecode } from "@/lib/timecode";
import { captureVideoFrame } from "@/lib/frame-capture";
import { loadYouTubeApi, type YTPlayer } from "@/lib/youtube-api";
import { useTime, type TimeStore } from "@/lib/time-store";

export type VideoSource = { kind: "youtube"; videoId: string } | { kind: "upload"; url: string };

export type PlayerHandle = {
  play(): void;
  pause(): void;
  toggle(): void;
  isPaused(): boolean;
  getCurrentTime(): number;
  getDuration(): number;
  seek(t: number): void;
  seekBy(delta: number): void;
  stepFrame(dir: 1 | -1): void;
  setRate(r: number): void;
  captureFrame(): Promise<Blob | null>;
  canCapture: boolean;
};

type Driver = {
  play(): void;
  pause(): void;
  isPaused(): boolean;
  getTime(): number;
  getDuration(): number;
  seek(t: number): void;
  setRate(r: number): void;
  capture(): Promise<Blob | null>;
};

type Props = {
  source: VideoSource;
  fps: number;
  timeStore: TimeStore;
  onDuration?: (d: number) => void;
  ref?: Ref<PlayerHandle>;
};

export function VideoPlayer({ source, fps, timeStore, onDuration, ref }: Props) {
  const driver = useRef<Driver | null>(null);
  const lastSeek = useRef<{ t: number; at: number } | null>(null);
  const durationReported = useRef(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [rate, setRateState] = useState(1);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const ytContainer = useRef<HTMLDivElement>(null);
  const videoEl = useRef<HTMLVideoElement>(null);
  const onDurationRef = useRef(onDuration);
  onDurationRef.current = onDuration;

  const reportDuration = useCallback((d: number) => {
    if (!Number.isFinite(d) || d <= 0) return;
    setDuration(d);
    if (!durationReported.current) {
      durationReported.current = true;
      onDurationRef.current?.(d);
    }
  }, []);

  // YouTube driver
  useEffect(() => {
    if (source.kind !== "youtube" || !ytContainer.current) return;
    let player: YTPlayer | null = null;
    let cancelled = false;
    const host = document.createElement("div");
    ytContainer.current.appendChild(host);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        player = new YT.Player(host, {
          videoId: source.videoId,
          width: "100%",
          height: "100%",
          playerVars: { controls: 0, disablekb: 1, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, fs: 0 },
          events: {
            onReady: ({ target }) => {
              if (cancelled) return;
              driver.current = {
                play: () => target.playVideo(),
                pause: () => target.pauseVideo(),
                isPaused: () => target.getPlayerState() !== YT.PlayerState.PLAYING && target.getPlayerState() !== YT.PlayerState.BUFFERING,
                getTime: () => target.getCurrentTime() ?? 0,
                getDuration: () => target.getDuration() ?? 0,
                seek: (t) => target.seekTo(t, true),
                setRate: (r) => target.setPlaybackRate(r),
                capture: async () => null,
              };
              setReady(true);
              reportDuration(target.getDuration());
            },
            onStateChange: ({ data }) => setPlaying(data === YT.PlayerState.PLAYING || data === YT.PlayerState.BUFFERING),
            onError: ({ data }) =>
              setError(
                data === 101 || data === 150
                  ? "The owner of this video doesn't allow embedding. Try another upload of the match."
                  : data === 100
                    ? "This video was removed or is private."
                    : "YouTube couldn't play this video.",
              ),
          },
        });
      })
      .catch((e: Error) => setError(e.message));
    const container = ytContainer.current;
    return () => {
      cancelled = true;
      driver.current = null;
      try {
        player?.destroy();
      } catch {}
      container.innerHTML = "";
    };
  }, [source, reportDuration]);

  // HTML5 driver
  useEffect(() => {
    if (source.kind !== "upload" || !videoEl.current) return;
    const v = videoEl.current;
    driver.current = {
      play: () => void v.play().catch(() => {}),
      pause: () => v.pause(),
      isPaused: () => v.paused,
      getTime: () => v.currentTime,
      getDuration: () => v.duration || 0,
      seek: (t) => {
        v.currentTime = t;
      },
      setRate: (r) => {
        v.playbackRate = r;
      },
      capture: () => captureVideoFrame(v),
    };
    return () => {
      driver.current = null;
    };
  }, [source]);

  // Playhead loop. After a seek the reported time can lag, so show the target briefly.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const d = driver.current;
      if (d) {
        const ls = lastSeek.current;
        const recent = ls && performance.now() - ls.at < 350 && d.isPaused();
        timeStore.set(recent ? ls.t : d.getTime());
        if (!durationReported.current) reportDuration(d.getDuration());
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [timeStore, reportDuration]);

  const seek = useCallback(
    (t: number) => {
      const d = driver.current;
      if (!d) return;
      const max = d.getDuration() || Number.POSITIVE_INFINITY;
      const clamped = Math.min(Math.max(0, t), max);
      lastSeek.current = { t: clamped, at: performance.now() };
      d.seek(clamped);
      timeStore.set(clamped);
    },
    [timeStore],
  );

  const currentTime = useCallback(() => {
    const d = driver.current;
    if (!d) return 0;
    const ls = lastSeek.current;
    if (ls && performance.now() - ls.at < 350 && d.isPaused()) return ls.t;
    return d.getTime();
  }, []);

  const toggle = useCallback(() => {
    const d = driver.current;
    if (!d) return;
    if (d.isPaused()) d.play();
    else d.pause();
  }, []);

  const stepFrame = useCallback(
    (dir: 1 | -1) => {
      const d = driver.current;
      if (!d) return;
      d.pause();
      const f = Math.max(1, fps);
      const frame = Math.floor(currentTime() * f + 1e-6) + dir;
      // Seek to the middle of the frame so every browser lands on the intended one.
      seek(Math.max(0, (frame + 0.5) / f));
    },
    [fps, currentTime, seek],
  );

  const setRate = useCallback((r: number) => {
    driver.current?.setRate(r);
    setRateState(r);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      play: () => driver.current?.play(),
      pause: () => driver.current?.pause(),
      toggle,
      isPaused: () => driver.current?.isPaused() ?? true,
      getCurrentTime: currentTime,
      getDuration: () => driver.current?.getDuration() ?? 0,
      seek,
      seekBy: (delta) => seek(currentTime() + delta),
      stepFrame,
      setRate,
      captureFrame: async () => (driver.current ? driver.current.capture() : null),
      canCapture: source.kind === "upload",
    }),
    [toggle, currentTime, seek, stepFrame, setRate, source.kind],
  );

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-black">
      <div className="relative aspect-video w-full bg-black">
        {source.kind === "youtube" ? (
          <>
            <div ref={ytContainer} className="absolute inset-0 [&_iframe]:size-full" />
            {/* Click shield: keeps keyboard focus on the page so shortcuts keep working. */}
            <div className="absolute inset-0 cursor-pointer" onClick={toggle} aria-hidden />
          </>
        ) : (
          <video
            ref={videoEl}
            src={source.url}
            crossOrigin="anonymous"
            playsInline
            preload="auto"
            className="absolute inset-0 size-full cursor-pointer"
            onClick={toggle}
            onLoadedMetadata={(e) => {
              setReady(true);
              reportDuration(e.currentTarget.duration);
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onError={() => setError("The video failed to load. The link may have expired — reload the page.")}
          />
        )}
        {!ready && !error && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center bg-black/85 p-6 text-center">
            <div className="space-y-2">
              <AlertTriangle className="mx-auto size-8 text-brand" />
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t bg-panel px-3 py-2">
        <SeekBar timeStore={timeStore} duration={duration} onSeek={seek} />
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost" onClick={() => stepFrame(-1)} aria-label="Previous frame">
                <ChevronLeft />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Previous frame ( , )</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
                {playing ? <Pause /> : <Play />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Play / pause (Space)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost" onClick={() => stepFrame(1)} aria-label="Next frame">
                <ChevronRight />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Next frame ( . )</TooltipContent>
          </Tooltip>
          <Timecode timeStore={timeStore} duration={duration} fps={fps} />
          <div className="ml-auto flex items-center gap-0.5 rounded-md bg-background p-0.5" role="group" aria-label="Playback speed">
            {PLAYBACK_RATES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRate(r)}
                className={cn(
                  "rounded px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground",
                  rate === r && "bg-brand text-black hover:text-black",
                )}
              >
                {r}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Timecode({ timeStore, duration, fps }: { timeStore: TimeStore; duration: number; fps: number }) {
  const t = useTime(timeStore);
  return (
    <span className="font-mono text-sm tabular-nums" aria-live="off">
      <span className="text-foreground">{formatTimecode(t, fps)}</span>
      <span className="text-muted-foreground"> / {formatTimecode(duration, fps)}</span>
      <span className="ml-2 text-xs text-muted-foreground">{Math.round(fps * 100) / 100}fps</span>
    </span>
  );
}

function SeekBar({ timeStore, duration, onSeek }: { timeStore: TimeStore; duration: number; onSeek: (t: number) => void }) {
  const t = useTime(timeStore);
  const bar = useRef<HTMLDivElement>(null);
  const pct = duration > 0 ? Math.min(100, (t / duration) * 100) : 0;

  function seekFromEvent(clientX: number) {
    const el = bar.current;
    if (!el || !duration) return;
    const rect = el.getBoundingClientRect();
    onSeek(((clientX - rect.left) / rect.width) * duration);
  }

  return (
    <div
      ref={bar}
      className="group relative h-3 cursor-pointer touch-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        seekFromEvent(e.clientX);
      }}
      onPointerMove={(e) => e.buttons === 1 && seekFromEvent(e.clientX)}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(t)}
    >
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded bg-muted group-hover:h-1.5">
        <div className="h-full rounded bg-brand" style={{ width: `${pct}%` }} />
      </div>
      <div
        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand opacity-0 group-hover:opacity-100"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}
