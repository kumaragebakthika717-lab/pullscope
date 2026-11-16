"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { uuid } from "@/lib/schemas";
import { DEFAULT_FPS, MAX_UPLOAD_SECONDS } from "@/lib/constants";
import type { ActionResult } from "@/lib/types";

type Ffmpeg = typeof import("fluent-ffmpeg");
type FfprobeInstaller = typeof import("@ffprobe-installer/ffprobe");

/**
 * Loaded on demand: the installer resolves a per-platform binary that some hosts don't ship, and a
 * top-level require would take down every action sharing this module's graph.
 */
async function loadFfmpeg(): Promise<Ffmpeg> {
  const ffmpegMod = await import("fluent-ffmpeg");
  const installerMod = await import("@ffprobe-installer/ffprobe");
  const ffmpeg = ((ffmpegMod as unknown as { default?: Ffmpeg }).default ?? ffmpegMod) as Ffmpeg;
  const installer = ((installerMod as unknown as { default?: FfprobeInstaller }).default ??
    installerMod) as FfprobeInstaller;
  ffmpeg.setFfprobePath(installer.path);
  return ffmpeg;
}

function videoPath(userId: string, matchId: string) {
  return `${userId}/${matchId}/video.mp4`;
}

export async function getSignedUploadUrl(
  matchId: string,
): Promise<ActionResult<{ path: string; token: string; signedUrl: string }>> {
  if (!uuid.safeParse(matchId).success) return { ok: false, error: "Invalid match", code: "invalid" };
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Not signed in", code: "unauthorized" };
  const { data: match } = await supabase
    .from("matches")
    .select("id, source_type")
    .eq("id", matchId)
    .maybeSingle();
  if (!match || match.source_type !== "upload") return { ok: false, error: "Match not found", code: "not_found" };

  const path = videoPath(user.id, matchId);
  const { data, error } = await supabase.storage.from("videos").createSignedUploadUrl(path, { upsert: true });
  if (error || !data) return { ok: false, error: error?.message ?? "Could not create upload URL" };
  return { ok: true, data: { path, token: data.token, signedUrl: data.signedUrl } };
}

async function probe(url: string): Promise<{ fps: number | null; duration: number | null }> {
  const ffmpeg = await loadFfmpeg();
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(url, (err, meta) => {
      if (err) return reject(err);
      const stream = meta.streams.find((s) => s.codec_type === "video");
      const fps = parseRate(stream?.avg_frame_rate) ?? parseRate(stream?.r_frame_rate);
      const duration = Number(meta.format.duration ?? stream?.duration);
      resolve({ fps, duration: Number.isFinite(duration) && duration > 0 ? duration : null });
    });
  });
}

function parseRate(rate?: string): number | null {
  if (!rate) return null;
  const [n, d] = rate.split("/").map(Number);
  const v = d ? n / d : n;
  return Number.isFinite(v) && v > 0 && v < 1000 ? v : null;
}

/**
 * Probes the uploaded file for fps + duration. If ffprobe is unavailable, falls back to the
 * browser-reported duration and 30fps so the match stays usable.
 */
export async function finalizeUpload(
  matchId: string,
  clientDurationSec?: number,
): Promise<ActionResult<{ fps: number; duration_sec: number | null; probed: boolean }>> {
  if (!uuid.safeParse(matchId).success) return { ok: false, error: "Invalid match", code: "invalid" };
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Not signed in", code: "unauthorized" };

  const path = videoPath(user.id, matchId);
  const { data: signed, error: signErr } = await supabase.storage.from("videos").createSignedUrl(path, 600);
  if (signErr || !signed) return { ok: false, error: "Uploaded video not found", code: "not_found" };

  let fps: number = DEFAULT_FPS;
  let duration: number | null = clientDurationSec && clientDurationSec > 0 ? clientDurationSec : null;
  let probed = false;
  try {
    const meta = await probe(signed.signedUrl);
    fps = meta.fps ?? DEFAULT_FPS;
    duration = meta.duration ?? duration;
    probed = true;
  } catch (e) {
    console.error("ffprobe failed, using fallback metadata", e);
  }

  if (duration && duration > MAX_UPLOAD_SECONDS + 1) {
    await supabase.storage.from("videos").remove([path]);
    return { ok: false, error: "Videos are limited to 30 minutes on the MVP", code: "invalid" };
  }

  const { error } = await supabase
    .from("matches")
    .update({ video_path: path, fps, duration_sec: duration })
    .eq("id", matchId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/match/${matchId}`);
  return { ok: true, data: { fps, duration_sec: duration, probed } };
}
