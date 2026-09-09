import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { publicEnv, serverEnv } from '@/lib/env';

/**
 * The service-role client. Bypasses RLS, so it is only ever constructed inside a
 * route handler or a server action that has already established who the caller
 * is and what they may touch. `server-only` makes an import from a client
 * component a build error rather than a leaked key.
 */
export function createServiceClient() {
  return createSupabaseClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SB_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
