"use client";

import { DEFAULT_FPS } from "@/lib/constants";

const COMMON_FPS = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120, 240];

function snapFps(raw: number): number {
  for (const candidate of COMMON_FPS) {
    if (Math.abs(raw - candidate) / candidate < 0.02) return candidate;
  }
  return Math.round(raw * 100) / 100;
}

type FrameCallbackMetadata = { mediaTime: number };

export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

/**
 * Estimates fps on-device from the video's frame callbacks (no server, no ffmpeg).
 * Returns null when the browser cannot report frame metadata; callers fall back to manual fps.
 */
export async function detectVideoFps(url: string): Promise<number | null> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  const withFrames = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: (now: number, meta: FrameCallbackMetadata) => void) => number;
  };
  if (!withFrames.requestVideoFrameCallback) return null;

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 4000);
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      resolve();
    };
    video.onerror = () => {
      clearTimeout(timer);
      resolve();
    };
  });

  const deltas: number[] = [];
  let last: number | null = null;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(finish, 3000);
    function finish() {
      clearTimeout(timer);
      video.pause();
      resolve();
    }
    function sample(_now: number, meta: FrameCallbackMetadata) {
      if (last !== null) {
        const delta = meta.mediaTime - last;
        if (delta > 0) deltas.push(delta);
      }
      last = meta.mediaTime;
      if (deltas.length >= 24) return finish();
      withFrames.requestVideoFrameCallback?.(sample);
    }
    withFrames.requestVideoFrameCallback?.(sample);
    void video.play().catch(finish);
  });

  video.removeAttribute("src");
  video.load();

  if (deltas.length < 8) return null;
  const sorted = [...deltas].sort((a, b) => a - b);
  const middle = sorted[Math.floor(sorted.length / 2)];
  if (!(middle > 0)) return null;
  const fps = snapFps(1 / middle);
  if (!Number.isFinite(fps) || fps < 1 || fps > 480) return null;
  return fps;
}

export function resolveFps(detected: number | null): { fps: number; source: "detected" | "default" } {
  return detected ? { fps: detected, source: "detected" } : { fps: DEFAULT_FPS, source: "default" };
}

export function frameAt(time: number, fps: number): number {
  return Math.max(0, Math.floor(time * Math.max(1, fps) + 1e-6));
}
