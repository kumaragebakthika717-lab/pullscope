"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { attributeNameSchema, uuid } from "@/lib/schemas";
import type { ActionResult, RubricAttribute } from "@/lib/types";

export async function getMyRubric(): Promise<{ templateId: string | null; attributes: RubricAttribute[] }> {
  const { supabase, user } = await requireUser();
  if (!user) return { templateId: null, attributes: [] };
  const { data: ur } = await supabase.from("user_rubrics").select("template_id").eq("user_id", user.id).maybeSingle();
  if (!ur) return { templateId: null, attributes: [] };
  const { data } = await supabase
    .from("rubric_attributes")
    .select("*")
    .eq("template_id", ur.template_id)
    .eq("is_active", true)
    .order("display_order");
  return { templateId: ur.template_id, attributes: (data ?? []) as RubricAttribute[] };
}

function done(): ActionResult {
  revalidatePath("/settings/rubric");
  return { ok: true, data: null };
}

export async function updateAttribute(
  id: string,
  input: { name: string; description?: string | null },
): Promise<ActionResult> {
  const name = attributeNameSchema.safeParse(input.name);
  if (!uuid.safeParse(id).success || !name.success) return { ok: false, error: "Name is required", code: "invalid" };
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("rubric_attributes")
    .update({ name: name.data, description: input.description?.trim().slice(0, 300) || null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return done();
}

export async function addAttribute(input: { name: string; description?: string | null }): Promise<ActionResult<RubricAttribute>> {
  const name = attributeNameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, error: name.error.issues[0].message, code: "invalid" };
  const { templateId, attributes } = await getMyRubric();
  if (!templateId) return { ok: false, error: "No rubric found", code: "not_found" };
  const { supabase } = await requireUser();
  const { data: maxRow } = await supabase
    .from("rubric_attributes")
    .select("display_order")
    .eq("template_id", templateId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("rubric_attributes")
    .insert({
      template_id: templateId,
      name: name.data,
      description: input.description?.trim().slice(0, 300) || null,
      display_order: (maxRow?.display_order ?? attributes.length) + 1,
    })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/rubric");
  return { ok: true, data: data as RubricAttribute };
}

/** Swaps an attribute with its neighbour in the active list. */
export async function reorderAttribute(id: string, direction: "up" | "down"): Promise<ActionResult> {
  const { attributes } = await getMyRubric();
  const i = attributes.findIndex((a) => a.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= attributes.length) return { ok: true, data: null };
  const a = attributes[i];
  const b = attributes[j];
  const { supabase } = await requireUser();
  const r1 = await supabase.from("rubric_attributes").update({ display_order: b.display_order }).eq("id", a.id);
  const r2 = await supabase.from("rubric_attributes").update({ display_order: a.display_order }).eq("id", b.id);
  if (r1.error || r2.error) return { ok: false, error: (r1.error ?? r2.error)!.message };
  return done();
}

/** Soft-deletes so annotations referencing the attribute keep their history. */
export async function deleteAttribute(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid attribute", code: "invalid" };
  const { supabase } = await requireUser();
  const { error } = await supabase.from("rubric_attributes").update({ is_active: false }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return done();
}
