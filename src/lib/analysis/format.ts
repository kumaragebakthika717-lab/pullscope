import type { EffortBasis } from "./metrics";

/** Accepts "83.4", "1:23.4" or "1:02:03.5" (also comma decimals). Returns seconds or null. */
export function parseTimeInput(raw: string): number | null {
  const value = raw.trim().replace(",", ".");
  if (!value) return null;
  if (/^\d+(\.\d+)?$/.test(value)) {
    const sec = Number(value);
    return Number.isFinite(sec) && sec > 0 ? sec : null;
  }
  const parts = value.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const numbers = parts.map(Number);
  const seconds = numbers.pop() as number;
  const minutes = numbers.pop() as number;
  const hours = numbers.length ? (numbers.pop() as number) : 0;
  if (seconds >= 60 || (numbers.length === 0 && minutes >= 60 && hours === 0)) return null;
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}

export function formatSeconds(sec: number, decimals = 2): string {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  const fixed = sec.toFixed(decimals);
  const whole = Math.floor(Number(fixed));
  const frac = decimals > 0 ? Number(fixed).toFixed(decimals).split(".")[1] : null;
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  const base = `${m}:${s.toString().padStart(2, "0")}`;
  return frac ? `${base}.${frac}` : base;
}

export function formatEffort(value: number | null, basis: EffortBasis): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return basis === "distance" ? `${formatSeconds(value)} /100m` : `${formatSeconds(value)} /interval`;
}

export function formatDistance(m: number | null): string {
  if (m === null || !Number.isFinite(m) || m <= 0) return "—";
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

/** Signed percent with an explicit + for gains/slowdowns. */
export function formatPct(value: number | null, decimals = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

/** Signed plain seconds, e.g. "−0.42 s". */
export function formatDeltaSeconds(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)} s`;
}

export function todayISO(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function formatDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
