"use client";

/** Draws the current frame of a same-origin/CORS-enabled <video> to a JPEG blob. Returns null if the canvas is tainted. */
export async function captureVideoFrame(video: HTMLVideoElement, maxWidth = 1280): Promise<Blob | null> {
  if (!video.videoWidth || !video.videoHeight) return null;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  } catch {
    // SecurityError: cross-origin source without CORS headers taints the canvas.
    return null;
  }
}
