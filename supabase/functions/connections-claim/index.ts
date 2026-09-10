// POST /connections-claim. Turns a pending OAuth exchange into a connection for the JWT user.

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
import { buildScopeSelection, storedSelectionOf } from '../_shared/scope_selection.ts';
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
      // Only the ticket hash reaches the database, and the rpc deletes and returns at once.
      const { data, error } = await db.rpc('consume_pending_connection', {
        p_ticket_hash: await sha256Hex(ticket),
      });
      if (error) throw new ApiError(500, 'internal', 'the connection could not be claimed');

      const row = parsePendingConnectionRow(data);
      if (!row) return null;

      return {
        userId: row.user_id,
        provider: row.provider,
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

/** Fills the connect screen's scope picker once the token lands. Best effort, never fatal. */
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
      .select('access_token_enc, scope_selection')
      .eq('id', connectionId)
      .maybeSingle<{ access_token_enc: string | null; scope_selection: unknown }>();
    if (!data?.access_token_enc) return;

    // A first claim has none. A reconnect keeps the routing the user already chose.
    const routes = storedSelectionOf(data.scope_selection)?.routes ?? {};

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
        scope_selection: buildScopeSelection(driver.scopeSelectionKind, options, routes),
      })
      .eq('id', connectionId);
  } catch (err) {
    if (err instanceof SourceError) {
      console.error('scope listing after claim failed', provider, err.message);
      return;
    }

    // Anything else means the connection cannot be read back, usually an undecryptable token.
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
