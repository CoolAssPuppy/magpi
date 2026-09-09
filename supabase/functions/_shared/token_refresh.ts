// Keeping a connection's access token alive.
//
// This is the thing magpi does not have: `refresh()` is defined on the driver
// interface there and never called, so `refresh_token_enc` is stored and unused
// and a long-lived sync stops working an hour after it was set up, silently.
//
// Every read path goes through resolveCredentials, so refresh() is called by
// construction rather than by remembering to. A refusal is a status change the
// user can see on the connections page, never a stalled sync with no reason.

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
): Promise<CredentialsOutcome> {
  await markConnectionStatus(deps.db, connection.id, 'expired', detail);
  return { kind: 'expired', detail };
}

/**
 * A usable access token for one connection, renewing it first when it is spent.
 *
 * The outcome is a value rather than an exception because both answers are
 * ordinary: a sync worker walking twenty connections skips the expired one and
 * carries on with the rest.
 */
export async function resolveCredentials(
  connection: ConnectionRow,
  deps: RefreshDeps,
): Promise<CredentialsOutcome> {
  const env = deps.env ?? denoEnv;
  const scopeSelection = selectedIdsOf(connection.scope_selection);

  if (!connection.access_token_enc) {
    return await expire(deps, connection, 'this connection holds no token, connect it again');
  }

  const ctx = { userId: connection.user_id, provider: connection.provider };

  if (!isSpent(connection, deps.http.now())) {
    const accessToken = await decryptProviderToken(connection.access_token_enc, ctx, env);
    return { kind: 'ready', credentials: { accessToken, scopeSelection }, refreshed: false };
  }

  if (!connection.refresh_token_enc) {
    return await expire(
      deps,
      connection,
      `${driverFor(connection.provider).displayName} did not issue a renewal token, ` +
        'connect it again',
    );
  }

  const provider = await loadProvider(deps.db, connection.provider);
  if (!provider) {
    return await expire(
      deps,
      connection,
      `${driverFor(connection.provider).displayName} is no longer available`,
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
      const accessToken = await decryptProviderToken(connection.access_token_enc, ctx, env);
      return { kind: 'ready', credentials: { accessToken, scopeSelection }, refreshed: false };
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
        return await expire(deps, connection, 'the renewed token could not be stored');
      }

      return {
        kind: 'ready',
        credentials: { accessToken: outcome.accessToken, scopeSelection },
        refreshed: true,
      };
    }
  }
}
