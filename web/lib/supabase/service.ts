import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { publicEnv, serverEnv } from '@/lib/env';

/**
 * The service-role client, on top of the Library's trust-level split. It
 * bypasses RLS, so it is only ever constructed after the caller and what they
 * may touch are already established.
 *
 * `server-only` turns an import from a client component into a build error
 * rather than a leaked key.
 */
export function createServiceClient() {
  return createSupabaseClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SB_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
