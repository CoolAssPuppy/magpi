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
import { requireUser } from '../_shared/auth.ts';
import { sha256Hex } from '../_shared/crypto.ts';
import { claimConnection, type ClaimPort, type PendingConnection } from '../_shared/claim.ts';
import { storeConnection } from './store.ts';
import {
  connectionsClaimSchema,
  parseBody,
  parsePendingConnectionRow,
} from '../_shared/validate.ts';
import { liveHttp } from '../_shared/deps.ts';
import { buildScopeSelection } from '../_shared/scope_selection.ts';
import { decryptProviderToken } from '../_shared/provider_tokens.ts';
import { driverFor, hasDriver } from '../_shared/sources/index.ts';
import { SourceError } from '../_shared/sources/contract.ts';

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

      const row = parsePendingConnectionRow(data);
      if (!row) return null;

      return {
        userId: row.user_id,
        provider: row.provider,
        spaceId: row.space_id,
        externalAccountId: row.external_account_id ?? null,
        accessTokenEnc: row.access_token_enc,
        refreshTokenEnc: row.refresh_token_enc ?? null,
        scopes: row.scopes ?? [],
        tokenExpiresAt: row.token_expires_at ?? null,
        returnTo: row.return_to ?? null,
      };
    },

    storeConnection: (pending: PendingConnection) => storeConnection(db, pending),

    audit: (entry) => audit({ ...entry, ip: core.ip }),
  };

  const result = await claimConnection(port, user.id, input.ticket);
  await populatePicker(db, result.connection_id, result.provider, user.id);
  return jsonResponse(result);
});

/**
 * Fills in what the connect screen offers, immediately after the token lands.
 *
 * Best effort and never fatal: the connection is already stored and usable, and
 * connections-scopes refreshes this on demand anyway. Doing it here only saves
 * the user watching a spinner on the screen they are already looking at.
 *
 * The catch is narrow. A provider having a bad minute is what best effort is
 * for. A token that will not decrypt is a connection that can never sync, and
 * catching that alongside the rest returned a successful claim with an empty
 * picker and nothing anywhere saying why.
 */
async function populatePicker(
  db: ReturnType<typeof serviceClient>,
  connectionId: string,
  provider: string,
  userId: string,
): Promise<void> {
  if (!hasDriver(provider)) return;
  const driver = driverFor(provider);
  if (driver.scopeSelectionKind === null) return;

  try {
    const { data } = await db
      .from('connections')
      .select('access_token_enc')
      .eq('id', connectionId)
      .maybeSingle<{ access_token_enc: string | null }>();
    if (!data?.access_token_enc) return;

    const http = { fetch: liveHttp.fetch, now: () => new Date() };
    const options = await driver.listScopeOptions(
      {
        accessToken: await decryptProviderToken(data.access_token_enc, { userId, provider }),
        scopeSelection: { ids: [] },
      },
      http,
    );

    await db
      .from('connections')
      .update({
        scope_selection: buildScopeSelection(driver.scopeSelectionKind, options, []),
      })
      .eq('id', connectionId);
  } catch (err) {
    if (err instanceof SourceError) {
      console.error('scope listing after claim failed', provider, err.message);
      return;
    }

    // Anything else is the connection itself being unusable, most often a token
    // that will not decrypt. The row says so rather than the screen showing an
    // empty picker the user is expected to interpret.
    console.error('connection unusable after claim', provider, err);
    await db
      .from('connections')
      .update({
        status: 'error',
        status_detail: 'the connection was stored but could not be read back',
      })
      .eq('id', connectionId);
  }
}
