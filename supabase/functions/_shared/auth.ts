// Caller identity for the authenticated functions.
//
// The user id comes from a verified token, never from the request body. getUser
// validates against the auth server rather than decoding locally, so a revoked
// or rotated-key token is rejected; decoding the claims here would accept both.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { ApiError, bearerToken } from './errors.ts';
import { coreEnv, denoEnv, type EnvSource, publishableKey } from './env.ts';

export interface AuthedUser {
  id: string;
  email: string | null;
}

export async function requireUser(
  headers: Headers,
  source: EnvSource = denoEnv,
): Promise<AuthedUser> {
  const token = bearerToken(headers.get('authorization'), 'missing bearer token');

  const client = createClient(coreEnv(source).supabaseUrl, publishableKey(source), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, 'unauthorized', 'invalid session');

  return { id: data.user.id, email: data.user.email ?? null };
}

/**
 * The membership check every space-scoped write makes before it writes.
 *
 * Under the service role RLS is not enforcing anything, so this is the boundary.
 * It reads space_members directly rather than calling visible_space_ids(), which
 * resolves auth.uid() and would be nobody under this key.
 */
export async function requireSpaceMembership(
  db: SupabaseClient,
  userId: string,
  spaceId: string,
): Promise<{ orgId: string }> {
  const { data, error } = await db
    .from('spaces')
    .select('id, org_id, space_members!inner(user_id)')
    .eq('id', spaceId)
    .eq('space_members.user_id', userId)
    .maybeSingle<{ id: string; org_id: string }>();

  if (error) throw new ApiError(500, 'internal', 'space lookup failed');
  // A space the caller cannot see and a space that does not exist are one
  // answer, so the id space cannot be walked for spaces that exist.
  if (!data) throw new ApiError(404, 'unknown_space', 'no such space');
  return { orgId: data.org_id };
}
