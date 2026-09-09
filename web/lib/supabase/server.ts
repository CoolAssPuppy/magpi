import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env';

/**
 * The Supabase Library `client` block, with the generated Database generic
 * added. Without it every query returns `any`, which the type rules forbid.
 *
 * On Fluid compute this must never be hoisted into a module-scope variable.
 * Always construct one per request.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const env = publicEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a server component, where cookies are read-only. The
            // proxy refreshes the session, so nothing is lost.
          }
        },
      },
    },
  );
}
