// Caller identity for the authenticated functions, from a token the auth server verifies.

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

/** Membership check for space-scoped writes. Reads space_members directly, as RLS is off here. */
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
  // Invisible and nonexistent spaces return the same answer, so ids cannot be probed.
  if (!data) throw new ApiError(404, 'unknown_space', 'no such space');
  return { orgId: data.org_id };
}
