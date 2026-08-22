// After `supabase db reset` the browser still holds a cookie whose refresh
// token no longer exists. Left unhandled, that stale cookie breaks the app for
// good: the visitor cannot even reach /login, because /login is rendered by the
// same request that throws. A failed refresh means no session, so say so and
// delete the cookie.

// Generic over the user shape so callers keep supabase's own `User` rather than
// widening it down to a local interface and back again with an assertion.
export interface SessionClient<TUser> {
  auth: {
    getUser(): PromiseLike<{
      data: { user: TUser | null };
      error?: { code?: string; status?: number; message?: string } | null;
    }>;
  };
}

// Matched on the stable `code` field, not the message, which is prose.
const STALE_SESSION_CODES = new Set([
  "refresh_token_not_found",
  "refresh_token_already_used",
  "session_not_found",
  "session_expired",
  "bad_jwt",
]);

function readCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function readMessage(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

/** True when the error says the stored session can no longer be refreshed. */
export function isStaleSessionError(error: unknown): boolean {
  if (!error) return false;

  const code = readCode(error);
  if (code && STALE_SESSION_CODES.has(code)) return true;

  // Older auth servers send no code field. Keep this match narrow: a wide one
  // would swallow real failures and sign everyone out silently.
  return /invalid refresh token/i.test(readMessage(error));
}

/**
 * Matches `sb-<ref>-auth-token` and its `.0`, `.1` chunks. They have to be
 * deleted together; one chunk left behind is an unparseable cookie.
 */
export function isSupabaseAuthCookie(name: string): boolean {
  return name.startsWith("sb-") && name.includes("auth-token");
}

export interface SessionRead<TUser> {
  user: TUser | null;
  /** The caller should delete the auth cookies before responding. */
  isStale: boolean;
}

/** Converts an unrefreshable session into a signed-out one. Never throws. */
export async function readSessionUser<TUser>(
  client: SessionClient<TUser>,
): Promise<SessionRead<TUser>> {
  try {
    const result = await client.auth.getUser();
    if (isStaleSessionError(result.error)) {
      return { user: null, isStale: true };
    }
    return { user: result.data.user, isStale: false };
  } catch (error) {
    // supabase-js throws rather than returns when the refresh itself fails.
    if (isStaleSessionError(error)) return { user: null, isStale: true };
    return { user: null, isStale: false };
  }
}
