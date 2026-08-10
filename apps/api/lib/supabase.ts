import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Server-only Supabase client using the service-role key. Never import this
 * from a "use client" component — it must stay behind API routes so the key
 * and the daily answer key never reach the browser.
 */
export function getSupabaseServerClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Online mode is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).",
    );
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
