// POST /connections-claim
//
// The second half of the OAuth flow, and the reason the first half writes no
// connection. connections-callback parked an encrypted provider token under the
// account that started the flow. This decides whether that account is the one
// now asking, and it is the only place an exchange becomes a connection.
//
// The identity comes from a verified JWT, so the browser holding the session
// answers rather than the state value that started the flow. That closes the gap
// RFC 6749 10.12 describes: a link handed to someone else completes the exchange,
// arrives here as the wrong user, and is discarded.

import { ApiError, jsonResponse } from '../_shared/errors.ts';
import { serveFunction } from '../_shared/http.ts';
import { audit, serviceClient } from '../_shared/db.ts';
import { enforceRateLimits } from '../_shared/rate_limit.ts';
import { requireSpaceMembership, requireUser } from '../_shared/auth.ts';
import { sha256Hex } from '../_shared/crypto.ts';
import { claimConnection, type ClaimPort, type PendingConnection } from '../_shared/claim.ts';
import { connectionsClaimSchema, parseBody } from '../_shared/validate.ts';

interface PendingRow {
  user_id: string;
  provider: string;
  space_id: string;
  external_account_id: string | null;
  access_token_enc: string;
  refresh_token_enc: string | null;
  scopes: string[] | null;
  token_expires_at: string | null;
  return_to: string | null;
}

serveFunction('connections-claim', async (core) => {
  const input = parseBody(connectionsClaimSchema, core.body);
  const user = await requireUser(core.headers);
  const db = serviceClient();

  await enforceRateLimits(db, [
    { bucket: `connections-claim:user:${user.id}`, limit: 20, windowSeconds: 600 },
    { bucket: `connections-claim:ip:${core.ip}`, limit: 40, windowSeconds: 600 },
  ]);

  const port: ClaimPort = {
    async consumePending(ticket) {
      // Only the hash reaches the database, so a leaked row cannot be replayed
      // as a ticket. Delete and return in one statement, so two racing claims
      // cannot both win.
      const { data, error } = await db.rpc('consume_pending_connection', {
        p_ticket_hash: await sha256Hex(ticket),
      });
      if (error) throw new ApiError(500, 'internal', 'the connection could not be claimed');

      const row = (Array.isArray(data) ? data[0] : null) as PendingRow | null;
      if (!row) return null;

      return {
        userId: row.user_id,
        provider: row.provider,
        spaceId: row.space_id,
        externalAccountId: row.external_account_id,
        accessTokenEnc: row.access_token_enc,
        refreshTokenEnc: row.refresh_token_enc,
        scopes: row.scopes ?? [],
        tokenExpiresAt: row.token_expires_at,
        returnTo: row.return_to,
      };
    },

    // userId is unchanged by a successful claim, so the AAD the callback
    // encrypted under still holds and the ciphertext moves without decryption.
    async storeConnection(pending: PendingConnection) {
      // The space was chosen before the redirect, but a membership can be
      // revoked while a flow is in the air.
      const { orgId } = await requireSpaceMembership(db, pending.userId, pending.spaceId);

      // Reconnecting the same account in the same space replaces its token
      // rather than filing a second connection. A different account is a new
      // connection, which is the whole point of allowing many per provider.
      const { data: existing } = await db
        .from('connections')
        .select('id')
        .eq('space_id', pending.spaceId)
        .eq('user_id', pending.userId)
        .eq('provider', pending.provider)
        .eq('external_account_id', pending.externalAccountId ?? '')
        .maybeSingle<{ id: string }>();

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
        // Cleared on a successful reconnect, so a stale failure does not sit on
        // a working connection.
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
    },

    audit: (entry) => audit({ ...entry, ip: core.ip }),
  };

  return jsonResponse(await claimConnection(port, user.id, input.ticket));
});
