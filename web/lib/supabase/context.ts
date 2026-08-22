import "server-only";

import type { User } from "@supabase/supabase-js";
import { cache } from "react";

import { getBadgeApiUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { readSessionUser } from "@/lib/supabase/session";

export interface SessionContext {
  user: User;
  /** The caller's own JWT, forwarded to the gateway so it authorizes as them. */
  accessToken: string;
  apiBaseUrl: string;
}

/**
 * The signed-in caller, or null. The user comes from getUser; the session is
 * read only for the raw access token.
 *
 * Never return `session.user` instead: it is decoded from the JWT the browser
 * holds, so a change made minutes ago is invisible until that token refreshes.
 *
 * Memoized per request, because getUser is a network call to the auth server
 * rather than a cookie read, and a layout and its page both ask.
 *
 * The two auth calls stay sequential. getUser can rotate the token, so reading
 * the session alongside it would hand back the access token it just replaced.
 */
export const getSessionContext = cache(
  async function getSessionContext(): Promise<SessionContext | null> {
    const supabase = await createClient();

    const { user } = await readSessionUser(supabase);
    if (!user?.id) return null;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    return { user, accessToken: session.access_token, apiBaseUrl: getBadgeApiUrl() };
  },
);
