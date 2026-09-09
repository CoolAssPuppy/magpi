// Keeping a connection's access token alive.
//
// This is the thing the magpi badge project does not have: `refresh()` is
// defined on the driver
// interface there and never called, so `refresh_token_enc` is stored and unused
// and a long-lived sync stops working an hour after it was set up, silently.
//
// Every read path goes through resolveCredentials, so refresh() is called by
// construction rather than by remembering to. A refusal is a status change the
// user can see on the connections page, never a stalled sync with no reason.
//
// Two ways in, one body. resolveCredentials is for a caller about to read from
// the provider and needs the token; refreshIfSpent is for the scheduled pass,
// which only reports on connections and would otherwise pay a decrypt per row
// for a token it discards.

import type { SupabaseClient } from '@supabase/supabase-js';

import { type ConnectionRow, markConnectionStatus } from './connections.ts';
import { denoEnv, type EnvSource, oauthCredentials } from './env.ts';
import { decryptProviderToken, encryptProviderToken } from './provider_tokens.ts';
import { loadProvider, requireOAuthProvider } from './providers.ts';
import { selectedIdsOf } from './scope_selection.ts';
import type { SourceCredentials, SourceDeps } from './sources/contract.ts';
import { driverFor } from './sources/index.ts';

/**
 * How long before expiry a token counts as spent.
 *
 * A job that starts with fifty seconds left finishes with a token the provider
 * has already retired, so the renewal happens before the work rather than in the
 * middle of it.
 */
export const REFRESH_SKEW_SECONDS = 120;

export type CredentialsOutcome =
  | { kind: 'ready'; credentials: SourceCredentials; refreshed: boolean }
  | { kind: 'expired'; detail: string };

/**
 * What a renewal pass produced, with no readable token in it.
 *
 * The scheduled pass renews connections nobody is about to use, so a decrypted
 * access token would be twenty AES-GCM operations per tick spent answering a
 * question `isSpent` already answered off the row. `unspent` therefore hands
 * back the ciphertext it did not open, and only `refreshed` carries a plaintext
 * token, because the provider just gave us one.
 */
export type RefreshSummary =
  | { kind: 'unspent'; accessTokenEnc: string }
  | { kind: 'refreshed'; accessToken: string }
  | { kind: 'expired'; detail: string };

export interface RefreshDeps {
  db: SupabaseClient;
  http: SourceDeps;
  env?: EnvSource;
}

function isSpent(connection: ConnectionRow, now: Date): boolean {
  // A provider that never told us when the token dies is one we cannot renew on
  // a schedule; it gets renewed when it starts failing instead.
  if (!connection.token_expires_at) return false;
  const expiresAt = Date.parse(connection.token_expires_at);
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt - now.getTime() <= REFRESH_SKEW_SECONDS * 1000;
}

/** Records the reason on the row before it is returned, so the page can show it. */
async function expire(
  deps: RefreshDeps,
  connection: ConnectionRow,
  detail: string,
): Promise<{ kind: 'expired'; detail: string }> {
  await markConnectionStatus(deps.db, connection.id, 'expired', detail);
  return { kind: 'expired', detail };
}

/**
 * Renews one connection's token when it is spent, and says what happened.
 *
 * Nothing here reads the stored access token: a caller that only needs to know
 * the connection is healthy gets that answer without a decrypt, and a caller
 * that needs the token decrypts the ciphertext handed back.
 *
 * The outcome is a value rather than an exception because both answers are
 * ordinary: a sync worker walking twenty connections skips the expired one and
 * carries on with the rest.
 */
export async function refreshIfSpent(
  connection: ConnectionRow,
  deps: RefreshDeps,
): Promise<RefreshSummary> {
  const env = deps.env ?? denoEnv;

  if (!connection.access_token_enc) {
    return await expire(deps, connection, 'This connection holds no token, connect it again.');
  }
  const accessTokenEnc = connection.access_token_enc;

  const ctx = { userId: connection.user_id, provider: connection.provider };

  if (!isSpent(connection, deps.http.now())) {
    return { kind: 'unspent', accessTokenEnc };
  }

  if (!connection.refresh_token_enc) {
    return await expire(
      deps,
      connection,
      `${driverFor(connection.provider).displayName} did not issue a renewal token, ` +
        'connect it again.',
    );
  }

  const provider = await loadProvider(deps.db, connection.provider);
  if (!provider) {
    return await expire(
      deps,
      connection,
      `${driverFor(connection.provider).displayName} is no longer available.`,
    );
  }

  const outcome = await driverFor(connection.provider).refresh(deps.http, {
    refreshToken: await decryptProviderToken(connection.refresh_token_enc, ctx, env),
    ...oauthCredentials(connection.provider, env),
    tokenUrl: requireOAuthProvider(provider).token_url,
  });

  switch (outcome.kind) {
    case 'failed':
      return await expire(deps, connection, outcome.detail);

    case 'not_supported': {
      // The provider issues tokens that do not expire, so an expiry on the row
      // is stale bookkeeping rather than a dead token. Clearing it stops every
      // later pass from trying to renew something that cannot be renewed.
      await deps.db
        .from('connections')
        .update({ token_expires_at: null })
        .eq('id', connection.id);
      return { kind: 'unspent', accessTokenEnc };
    }

    case 'refreshed': {
      const { error } = await deps.db
        .from('connections')
        .update({
          access_token_enc: await encryptProviderToken(outcome.accessToken, ctx, env),
          refresh_token_enc: outcome.refreshToken
            ? await encryptProviderToken(outcome.refreshToken, ctx, env)
            : connection.refresh_token_enc,
          token_expires_at: outcome.expiresAt,
          status: 'active',
          status_detail: null,
        })
        .eq('id', connection.id);

      // A renewed token that was not stored works for this pass and is lost for
      // the next one, and the provider may have already retired the old one.
      if (error) {
        return await expire(deps, connection, 'The renewed token could not be stored.');
      }

      return { kind: 'refreshed', accessToken: outcome.accessToken };
    }
  }
}

/**
 * A usable access token for one connection, renewing it first when it is spent.
 *
 * Every read path goes through here, which is what makes the renewal happen by
 * construction rather than by remembering to.
 */
export async function resolveCredentials(
  connection: ConnectionRow,
  deps: RefreshDeps,
): Promise<CredentialsOutcome> {
  const scopeSelection = selectedIdsOf(connection.scope_selection);
  const summary = await refreshIfSpent(connection, deps);

  switch (summary.kind) {
    case 'expired':
      return summary;

    case 'refreshed':
      return {
        kind: 'ready',
        credentials: { accessToken: summary.accessToken, scopeSelection },
        refreshed: true,
      };

    case 'unspent': {
      const accessToken = await decryptProviderToken(
        summary.accessTokenEnc,
        { userId: connection.user_id, provider: connection.provider },
        deps.env ?? denoEnv,
      );
      return { kind: 'ready', credentials: { accessToken, scopeSelection }, refreshed: false };
    }
  }
}
