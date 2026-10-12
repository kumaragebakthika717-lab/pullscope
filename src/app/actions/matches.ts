"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createMatchSchema, uuid, type CreateMatchInput } from "@/lib/schemas";
import { DEFAULT_FPS, FREE_MATCH_LIMIT } from "@/lib/constants";
import type { ActionResult, Match } from "@/lib/types";

const LIMIT_MESSAGE = `Free plan allows ${FREE_MATCH_LIMIT} active matches. Archive or delete one, or upgrade to Pro.`;

export async function getMatchCount(): Promise<number> {
  const { supabase, user } = await requireUser();
  if (!user) return 0;
  const { count } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "active");
  return count ?? 0;
}

export async function createMatch(input: CreateMatchInput): Promise<ActionResult<{ id: string }>> {
  const parsed = createMatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, code: "invalid" };
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Not signed in", code: "unauthorized" };

  const { data: profile } = await supabase.from("profiles").select("plan").eq("id", user.id).single();
  if ((profile?.plan ?? "free") === "free" && (await getMatchCount()) >= FREE_MATCH_LIMIT) {
    return { ok: false, error: LIMIT_MESSAGE, code: "free_tier_limit" };
  }

  const v = parsed.data;
  const { data, error } = await supabase
    .from("matches")
    .insert({
      user_id: user.id,
      title: v.title,
      event_name: v.event_name || null,
      left_puller: v.left_puller,
      right_puller: v.right_puller,
      source_type: v.source_type,
      youtube_id: v.source_type === "youtube" ? v.youtube_id : null,
      fps: v.source_type === "youtube" ? DEFAULT_FPS : null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.message.includes("free_tier_limit")) return { ok: false, error: LIMIT_MESSAGE, code: "free_tier_limit" };
    return { ok: false, error: error.message };
  }
  revalidatePath("/dashboard");
  return { ok: true, data: { id: data.id } };
}

export async function listMatches(): Promise<Match[]> {
  const { supabase, user } = await requireUser();
  if (!user) return [];
  const { data } = await supabase
    .from("matches")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return (data ?? []) as Match[];
}

export async function getMatch(id: string): Promise<Match | null> {
  if (!uuid.safeParse(id).success) return null;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("matches").select("*").eq("id", id).maybeSingle();
  return (data as Match) ?? null;
}

export async function setMatchStatus(id: string, status: "active" | "archived"): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid match", code: "invalid" };
  const { supabase } = await requireUser();
  const { error } = await supabase.from("matches").update({ status }).eq("id", id);
  if (error) {
    if (error.message.includes("free_tier_limit")) return { ok: false, error: LIMIT_MESSAGE, code: "free_tier_limit" };
    return { ok: false, error: error.message };
  }
  revalidatePath("/dashboard");
  return { ok: true, data: null };
}

export async function deleteMatch(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid match", code: "invalid" };
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Not signed in", code: "unauthorized" };

  const prefix = `${user.id}/${id}`;
  for (const bucket of ["videos", "frames"]) {
    const { data: files } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
    if (files?.length) await supabase.storage.from(bucket).remove(files.map((f) => `${prefix}/${f.name}`));
  }
  const { error } = await supabase.from("matches").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true, data: null };
}

/** Stores the duration reported by the player once metadata loads (YouTube has no server-side duration). */
export async function setMatchDuration(id: string, durationSec: number): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !Number.isFinite(durationSec) || durationSec <= 0) {
    return { ok: false, error: "Invalid input", code: "invalid" };
  }
  const { supabase } = await requireUser();
  const { error } = await supabase.from("matches").update({ duration_sec: durationSec }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

const metaHits = new Map<string, number[]>();

export async function getYoutubeMeta(
  videoId: string,
): Promise<ActionResult<{ title: string; thumbnail: string; author: string; duration: number | null }>> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return { ok: false, error: "Invalid video id", code: "invalid" };
  const { user } = await requireUser();
  const key = user?.id ?? "anon";
  const now = Date.now();
  const hits = (metaHits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= 30) return { ok: false, error: "Too many requests, slow down", code: "rate_limited" };
  metaHits.set(key, [...hits, now]);

  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return { ok: false, error: "Video not found or not embeddable", code: "not_found" };
    const j = (await res.json()) as { title: string; thumbnail_url: string; author_name: string };
    // oEmbed has no duration; the player reports it on first load.
    return { ok: true, data: { title: j.title, thumbnail: j.thumbnail_url, author: j.author_name, duration: null } };
  } catch {
    return { ok: false, error: "Could not reach YouTube" };
  }
}
