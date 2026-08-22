// Caller identity for the authenticated functions.
//
// verify_jwt is disabled at the platform layer, because the public pairing
// endpoints share the same deployment. Verification here is therefore
// mandatory, and the user id comes from the verified token rather than from
// anything in the request body.

import { createClient } from "@supabase/supabase-js";
import { ApiError, bearerToken } from "./errors.ts";
import { publishableKey } from "./env.ts";

export interface AuthedUser {
  id: string;
  email: string | null;
}

/**
 * Resolves the caller's Supabase session. getUser validates against the auth
 * server rather than decoding locally, so a revoked or rotated-key token is
 * rejected; decoding the claims here would accept both.
 */
export async function requireUser(headers: Headers): Promise<AuthedUser> {
  const token = bearerToken(headers.get("authorization"), "missing bearer token");
  const url = Deno.env.get("SUPABASE_URL");
  const key = publishableKey();
  if (!url || !key) throw new ApiError(500, "misconfigured", "server is not configured");

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, "unauthorized", "invalid session");

  return { id: data.user.id, email: data.user.email ?? null };
}
