"use server";

import { customAlphabet } from "nanoid";
import { requireUser } from "@/lib/supabase/server";
import { uuid } from "@/lib/schemas";
import type { ActionResult } from "@/lib/types";

const makeSlug = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 6);

export async function generateReportCard(matchId: string): Promise<ActionResult<{ slug: string }>> {
  if (!uuid.safeParse(matchId).success) return { ok: false, error: "Invalid match", code: "invalid" };
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Not signed in", code: "unauthorized" };

  const { data: existing } = await supabase.from("report_cards").select("slug").eq("match_id", matchId).maybeSingle();
  if (existing) return { ok: true, data: { slug: existing.slug } };

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = makeSlug();
    const { error } = await supabase.from("report_cards").insert({ match_id: matchId, slug });
    if (!error) return { ok: true, data: { slug } };
    if (error.code !== "23505") return { ok: false, error: error.message };
    // 23505 on match_id means another request created it concurrently.
    const { data: raced } = await supabase.from("report_cards").select("slug").eq("match_id", matchId).maybeSingle();
    if (raced) return { ok: true, data: { slug: raced.slug } };
  }
  return { ok: false, error: "Could not generate a unique link, try again" };
}
