import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/** Cookie-less anon client for public, slug-scoped reads (report cards). */
export function createAnonClient() {
  const { url, anonKey } = supabaseEnv();
  return createSupabaseClient(
    url,
    anonKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
