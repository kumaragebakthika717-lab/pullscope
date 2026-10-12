import "server-only";
import { cache } from "react";
import { createAnonClient } from "@/lib/supabase/anon";
import { buildPullerSummary, type PullerSummary } from "@/lib/verdict";
import { youtubeThumbnail } from "@/lib/youtube";
import type { Annotation, Match, RoundBoundary, RubricAttribute } from "@/lib/types";

export type PublicCard = {
  slug: string;
  plan: "free" | "pro";
  ownerHandle: string | null;
  match: Match;
  thumbnail: string | null;
  videoUrl: string | null;
  rounds: RoundBoundary[];
  left: PullerSummary;
  right: PullerSummary;
  frameUrls: Record<string, string>;
};

type RpcPayload = {
  slug: string;
  plan: "free" | "pro";
  owner_handle: string | null;
  match: Match;
  attributes: RubricAttribute[];
  annotations: Annotation[];
  rounds: RoundBoundary[];
};

export const getPublicCard = cache(async (slug: string, withMedia = true): Promise<PublicCard | null> => {
  if (!/^[a-z0-9]{4,16}$/.test(slug)) return null;
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("get_public_card", { p_slug: slug });
  if (error || !data) return null;
  const p = data as RpcPayload;
  const m = p.match;

  const frameUrls: Record<string, string> = {};
  let videoUrl: string | null = null;
  if (withMedia) {
    const paths = p.annotations.map((a) => a.frame_path).filter((x): x is string => !!x);
    if (paths.length) {
      const { data: signed } = await supabase.storage.from("frames").createSignedUrls(paths, 60 * 60 * 24);
      signed?.forEach((s) => s.path && s.signedUrl && (frameUrls[s.path] = s.signedUrl));
    }
    if (m.source_type === "upload" && m.video_path) {
      const { data: v } = await supabase.storage.from("videos").createSignedUrl(m.video_path, 60 * 60 * 6);
      videoUrl = v?.signedUrl ?? null;
    }
  }

  return {
    slug: p.slug,
    plan: p.plan,
    ownerHandle: p.owner_handle,
    match: m,
    thumbnail: m.youtube_id ? youtubeThumbnail(m.youtube_id) : null,
    videoUrl,
    rounds: p.rounds,
    left: buildPullerSummary("left", m.left_puller, p.attributes, p.annotations),
    right: buildPullerSummary("right", m.right_puller, p.attributes, p.annotations),
    frameUrls,
  };
});
