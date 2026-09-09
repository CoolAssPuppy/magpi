// Where a claimed exchange becomes a row in connections.
//
// Separate from the entry point because this is the half with a rule in it: one
// connection per provider account per space. Reconnecting replaces the token on
// the connection that is already there, and only a genuinely different account
// files a second one.

import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError } from '../_shared/errors.ts';
import { requireSpaceMembership } from '../_shared/auth.ts';
import type { PendingConnection } from '../_shared/claim.ts';

/**
 * The connection this account already has in this space, or null.
 *
 * A provider that names no account stores null, and null is not a value any
 * equality test matches, in PostgREST or in Postgres. Asking with `eq` finds
 * nothing, and finding nothing files a second connection carrying a live token
 * on every reconnect.
 */
function findExisting(db: SupabaseClient, pending: PendingConnection) {
  const scoped = db
    .from('connections')
    .select('id')
    .eq('space_id', pending.spaceId)
    .eq('user_id', pending.userId)
    .eq('provider', pending.provider);

  return pending.externalAccountId === null
    ? scoped.is('external_account_id', null).maybeSingle<{ id: string }>()
    : scoped.eq('external_account_id', pending.externalAccountId).maybeSingle<{ id: string }>();
}

// userId is unchanged by a successful claim, so the AAD the callback encrypted
// under still holds and the ciphertext moves without decryption.
export async function storeConnection(
  db: SupabaseClient,
  pending: PendingConnection,
): Promise<{ connectionId: string }> {
  // The space was chosen before the redirect, but a membership can be revoked
  // while a flow is in the air.
  const { orgId } = await requireSpaceMembership(db, pending.userId, pending.spaceId);

  const { data: existing } = await findExisting(db, pending);

  const row = {
    org_id: orgId,
    space_id: pending.spaceId,
    user_id: pending.userId,
    provider: pending.provider,
    external_account_id: pending.externalAccountId,
    access_token_enc: pending.accessTokenEnc,
    refresh_token_enc: pending.refreshTokenEnc,
    scopes: pending.scopes,
    token_expires_at: pending.tokenExpiresAt,
    status: 'active' as const,
    // Cleared on a successful reconnect, so a stale failure does not sit on a
    // working connection.
    status_detail: null,
  };

  if (existing) {
    const { error } = await db.from('connections').update(row).eq('id', existing.id);
    if (error) throw new ApiError(500, 'internal', 'the connection could not be updated');
    return { connectionId: existing.id };
  }

  const { data, error } = await db
    .from('connections')
    .insert(row)
    .select('id')
    .single<{ id: string }>();
  if (error || !data) throw new ApiError(500, 'internal', 'the connection could not be stored');
  return { connectionId: data.id };
}
