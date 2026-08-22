import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSecretKey, getSupabaseUrl } from "@/lib/env";

/**
 * Bypasses RLS, so it exists for one job: calling public.consume_rate_limit,
 * which is granted to service_role only.
 *
 * Nothing is persisted or auto-refreshed. This client has no user, and
 * persisting would let a request's cookies bleed into a privileged client.
 */
export function createServiceClient(): SupabaseClient {
  return createSupabaseClient(getSupabaseUrl(), getSecretKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
