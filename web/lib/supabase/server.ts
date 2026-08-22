import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/env";

/**
 * Server-side client bound to the request cookie store, for server components,
 * server actions, and route handlers. Cookies are httpOnly, Secure, and
 * SameSite=Lax through @supabase/ssr.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a server component; middleware refreshes sessions.
        }
      },
    },
  });
}
