/** Formats raw seconds as mm:ss:ff (frame-accurate) for display only. */
export function formatTimecode(sec: number, fps: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const f = Math.max(1, Math.round(fps));
  // Small epsilon guards against float error (e.g. 2.9999999 -> frame 89 instead of 90).
  const totalFrames = Math.floor(sec * f + 1e-6);
  const frames = totalFrames % f;
  const totalSeconds = Math.floor(totalFrames / f);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60);
  return `${pad(m)}:${pad(s)}:${pad(frames)}`;
}

/** Short m:ss form for labels and tooltips. */
export function formatShort(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const t = Math.floor(sec);
  return `${Math.floor(t / 60)}:${pad(t % 60)}`;
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
