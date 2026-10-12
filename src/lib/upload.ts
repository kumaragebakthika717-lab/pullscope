"use client";

import { createClient } from "@/lib/supabase/client";
import { getSignedUploadUrl, finalizeUpload } from "@/app/actions/videos";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_SECONDS } from "@/lib/constants";

/** Reads duration from the file locally so we can reject >30 min videos before uploading. */
export function readLocalDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v.duration) ? v.duration : null);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    v.src = url;
  });
}

export async function validateVideoFile(file: File): Promise<{ ok: true; duration: number | null } | { ok: false; error: string }> {
  if (file.type !== "video/mp4" && !file.name.toLowerCase().endsWith(".mp4")) {
    return { ok: false, error: "Only MP4 files are supported" };
  }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "Files are limited to 500 MB" };
  const duration = await readLocalDuration(file);
  if (duration && duration > MAX_UPLOAD_SECONDS) return { ok: false, error: "Videos are limited to 30 minutes" };
  return { ok: true, duration };
}

export async function uploadMatchVideo(
  matchId: string,
  file: File,
  duration: number | null,
  onProgress: (pct: number) => void,
) {
  const signed = await getSignedUploadUrl(matchId);
  if (!signed.ok) throw new Error(signed.error);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signed.data.signedUrl);
    xhr.setRequestHeader("content-type", "video/mp4");
    xhr.setRequestHeader("x-upsert", "true");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = `Upload failed (${xhr.status})`;
      try {
        msg = JSON.parse(xhr.responseText).message ?? msg;
      } catch {}
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });

  const fin = await finalizeUpload(matchId, duration ?? undefined);
  if (!fin.ok) throw new Error(fin.error);
  return fin.data;
}

/** Uploads a captured frame straight to Storage; RLS restricts paths to the user's own folder. */
export async function uploadFrame(userId: string, matchId: string, blob: Blob): Promise<string> {
  const supabase = createClient();
  const path = `${userId}/${matchId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("frames").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error(error.message);
  return path;
}
