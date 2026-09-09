import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env';

/**
 * The Supabase Library `client` block, with the generated Database generic
 * added. Without it every query returns `any`, which the type rules forbid.
 */
export function createClient() {
  const env = publicEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
