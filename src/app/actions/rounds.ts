"use server";

import { requireUser } from "@/lib/supabase/server";
import { uuid } from "@/lib/schemas";
import type { ActionResult, RoundBoundary } from "@/lib/types";

export async function listRoundBoundaries(matchId: string): Promise<RoundBoundary[]> {
  if (!uuid.safeParse(matchId).success) return [];
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("round_boundaries")
    .select("*")
    .eq("match_id", matchId)
    .order("start_sec");
  return (data ?? []) as RoundBoundary[];
}

/**
 * Inserts a boundary at startSec and renumbers all rounds by start time, keeping each
 * round's end_sec equal to the next round's start.
 */
export async function markRoundBoundary(matchId: string, startSec: number): Promise<ActionResult<RoundBoundary[]>> {
  if (!uuid.safeParse(matchId).success || !Number.isFinite(startSec) || startSec < 0) {
    return { ok: false, error: "Invalid input", code: "invalid" };
  }
  const existing = await listRoundBoundaries(matchId);
  if (existing.some((r) => Math.abs(r.start_sec - startSec) < 0.05)) {
    return { ok: false, error: "A round already starts here", code: "invalid" };
  }
  return rewrite(matchId, [...existing.map((r) => r.start_sec), startSec]);
}

export async function setRoundBoundary(
  matchId: string,
  round: number,
  startSec: number,
  endSec?: number | null,
): Promise<ActionResult> {
  if (!uuid.safeParse(matchId).success || !Number.isInteger(round) || round < 1 || startSec < 0) {
    return { ok: false, error: "Invalid input", code: "invalid" };
  }
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("round_boundaries")
    .upsert(
      { match_id: matchId, round_number: round, start_sec: startSec, end_sec: endSec ?? null },
      { onConflict: "match_id,round_number" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function deleteRoundBoundary(matchId: string, id: string): Promise<ActionResult<RoundBoundary[]>> {
  if (!uuid.safeParse(matchId).success || !uuid.safeParse(id).success) {
    return { ok: false, error: "Invalid input", code: "invalid" };
  }
  const existing = await listRoundBoundaries(matchId);
  return rewrite(
    matchId,
    existing.filter((r) => r.id !== id).map((r) => r.start_sec),
  );
}

async function rewrite(matchId: string, starts: number[]): Promise<ActionResult<RoundBoundary[]>> {
  const { supabase } = await requireUser();
  const sorted = [...starts].sort((a, b) => a - b);
  const { error: delErr } = await supabase.from("round_boundaries").delete().eq("match_id", matchId);
  if (delErr) return { ok: false, error: delErr.message };
  if (sorted.length) {
    const { error } = await supabase.from("round_boundaries").insert(
      sorted.map((s, i) => ({
        match_id: matchId,
        round_number: i + 1,
        start_sec: s,
        end_sec: sorted[i + 1] ?? null,
      })),
    );
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, data: await listRoundBoundaries(matchId) };
}
