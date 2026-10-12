/**
 * Supabase clients built with a missing URL/Key throw `supabaseUrl is required` from inside the
 * library, which is indistinguishable from a code bug. Fail with the variable name instead.
 */
export function supabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    const missing = [!url && "NEXT_PUBLIC_SUPABASE_URL", !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY"]
      .filter(Boolean)
      .join(", ");
    throw new Error(`${missing} is not set — copy .env.example to .env.local and fill in your Supabase project values.`);
  }
  return { url, anonKey };
}
