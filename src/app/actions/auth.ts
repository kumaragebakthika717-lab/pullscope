"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function signIn(input: { email: string; password: string }): Promise<ActionResult> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, code: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function signUp(input: {
  email: string;
  password: string;
  next?: string;
}): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, code: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(safeNext(input.next))}` },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { needsConfirmation: !data.session } };
}

export async function signInWithGoogle(next?: string): Promise<ActionResult<{ url: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(safeNext(next))}` },
  });
  if (error || !data.url) return { ok: false, error: error?.message ?? "Could not start Google sign-in" };
  return { ok: true, data: { url: data.url } };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

function safeNext(next?: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}
