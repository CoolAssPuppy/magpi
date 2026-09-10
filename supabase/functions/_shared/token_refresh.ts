// Keeps access tokens alive. resolveCredentials returns a token, refreshIfSpent only a status.

import type { SupabaseClient } from '@supabase/supabase-js';

import { type ConnectionRow, markConnectionStatus } from './connections.ts';
import { denoEnv, type EnvSource, oauthCredentials } from './env.ts';
import { decryptProviderToken, encryptProviderToken } from './provider_tokens.ts';
import { loadProvider, requireOAuthProvider } from './providers.ts';
import { selectedIdsOf } from './scope_selection.ts';
import type { SourceCredentials, SourceDeps } from './sources/contract.ts';
import { driverFor } from './sources/index.ts';

/** How long before expiry a token counts as spent, so renewal happens before the work starts. */
export const REFRESH_SKEW_SECONDS = 120;

export type CredentialsOutcome =
  | { kind: 'ready'; credentials: SourceCredentials; refreshed: boolean }
  | { kind: 'expired'; detail: string };

/** What a renewal pass produced. Only `refreshed` holds a plaintext token, `unspent` ciphertext. */
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
  // No stored expiry means no scheduled renewal, so the token is renewed once it starts failing.
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

/** Renews a connection's token when it is spent. Never decrypts the stored access token. */
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
      // The provider's tokens do not expire, so clear the stale expiry and stop retrying renewal.
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

      // A renewed token that was not stored is lost, and the old one may already be retired.
      if (error) {
        return await expire(deps, connection, 'The renewed token could not be stored.');
      }

      return { kind: 'refreshed', accessToken: outcome.accessToken };
    }
  }
}

/** A usable access token for one connection, renewed first when spent. Every read path uses it. */
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
