"use server";

import { requireUser } from "@/lib/supabase/server";
import { annotationSchema, annotationUpdateSchema, uuid, type AnnotationInput, type AnnotationUpdate } from "@/lib/schemas";
import type { ActionResult, Annotation, AnnotationWithFrame } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof requireUser>>["supabase"];

async function withFrameUrls(supabase: Supabase, rows: Annotation[]): Promise<AnnotationWithFrame[]> {
  const paths = rows.map((r) => r.frame_path).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from("frames").createSignedUrls(paths, 60 * 60 * 6);
    data?.forEach((d) => d.path && d.signedUrl && urls.set(d.path, d.signedUrl));
  }
  return rows.map((r) => ({ ...r, frame_url: r.frame_path ? (urls.get(r.frame_path) ?? null) : null }));
}

export async function listAnnotations(matchId: string): Promise<AnnotationWithFrame[]> {
  if (!uuid.safeParse(matchId).success) return [];
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("annotations")
    .select("*")
    .eq("match_id", matchId)
    .order("timestamp_sec");
  return withFrameUrls(supabase, (data ?? []) as Annotation[]);
}

export async function createAnnotation(input: AnnotationInput): Promise<ActionResult<AnnotationWithFrame>> {
  const parsed = annotationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, code: "invalid" };
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Not signed in", code: "unauthorized" };
  const v = parsed.data;
  if (v.frame_path && !v.frame_path.startsWith(`${user.id}/${v.match_id}/`)) {
    return { ok: false, error: "Invalid frame path", code: "invalid" };
  }
  const { data, error } = await supabase
    .from("annotations")
    .insert({ ...v, note: v.note?.trim() || null })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  const [row] = await withFrameUrls(supabase, [data as Annotation]);
  return { ok: true, data: row };
}

export async function updateAnnotation(id: string, patch: AnnotationUpdate): Promise<ActionResult<AnnotationWithFrame>> {
  const parsed = annotationUpdateSchema.safeParse(patch);
  if (!uuid.safeParse(id).success || !parsed.success) return { ok: false, error: "Invalid input", code: "invalid" };
  const { supabase } = await requireUser();
  const values = { ...parsed.data };
  if ("note" in values) values.note = values.note?.trim() || null;
  const { data, error } = await supabase.from("annotations").update(values).eq("id", id).select("*").single();
  if (error) return { ok: false, error: error.message };
  const [row] = await withFrameUrls(supabase, [data as Annotation]);
  return { ok: true, data: row };
}

export async function deleteAnnotation(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid annotation", code: "invalid" };
  const { supabase } = await requireUser();
  const { data: row } = await supabase.from("annotations").select("frame_path").eq("id", id).maybeSingle();
  const { error } = await supabase.from("annotations").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (row?.frame_path) await supabase.storage.from("frames").remove([row.frame_path]);
  return { ok: true, data: null };
}
