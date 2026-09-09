// GET /connections-callback. Public, because the provider redirects the user's
// browser here with no Authorization header.
//
// The state value says which account started the flow. It does not show that the
// browser arriving here belongs to that account, and it cannot: the state travels
// in a URL, so anyone holding the URL could otherwise decide whose account a
// token lands on. RFC 6749 10.12 wants the callback bound to the user agent's
// authenticated state, and the only thing carrying that is the web app's session
// cookie, on the web app's origin rather than this one.
//
// So this function exchanges the code and parks the result in
// pending_connections. connections-claim runs with a verified JWT and commits
// only when the session matches. Nothing here writes to `connections`.
//
// Always ends in a redirect, never a JSON error page.

import { toErrorResponse } from '../_shared/errors.ts';
import { toCoreRequest } from '../_shared/http.ts';
import { audit, serviceClient } from '../_shared/db.ts';
import { enforceRateLimits } from '../_shared/rate_limit.ts';
import { encryptProviderToken } from '../_shared/provider_tokens.ts';
import { randomToken, sha256Hex } from '../_shared/crypto.ts';
import { loadProvider } from '../_shared/providers.ts';
import { isValidSlug } from '../_shared/validate.ts';
import { oauthCredentials, webBaseUrl } from '../_shared/env.ts';
import { callbackUrl, oauthDriverFor, PENDING_TTL_SECONDS } from '../_shared/oauth.ts';

const CONNECTIONS = '/connections';

// Where the browser goes to prove who it is. The web app holds the session
// cookie this origin cannot read, so the identity check happens there.
const COMPLETE = '/connections/complete';

function back(path: string, params: Record<string, string>): Response {
  const url = new URL(webBaseUrl() + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new Response(null, { status: 303, headers: { location: url.toString() } });
}

interface StateRow {
  user_id: string;
  provider: string;
  code_verifier: string;
  space_id: string;
  return_to: string | null;
}

Deno.serve(async (req: Request) => {
  const db = serviceClient();

  let core;
  try {
    core = await toCoreRequest(req, 'connections-callback');
  } catch (err) {
    return toErrorResponse(err);
  }

  try {
    await enforceRateLimits(db, [
      { bucket: `connections-callback:ip:${core.ip}`, limit: 60, windowSeconds: 600 },
    ]);

    const providerError = core.query.get('error');
    if (providerError) {
      return back(CONNECTIONS, { connection: 'cancelled', code: providerError.slice(0, 64) });
    }

    const state = core.query.get('state');
    const code = core.query.get('code');
    if (!state || !code) return back(CONNECTIONS, { connection: 'error', code: 'missing_state' });

    // One statement, so two callbacks carrying the same state cannot both
    // exchange a code.
    const { data: rows, error: stateError } = await db.rpc('consume_oauth_state', {
      p_state: state,
    });
    if (stateError) return back(CONNECTIONS, { connection: 'error', code: 'state_lookup_failed' });

    const pending = (Array.isArray(rows) ? rows[0] : null) as StateRow | null;
    if (!pending) {
      // Unknown, expired, or already used. Indistinguishable on purpose.
      return back(CONNECTIONS, { connection: 'expired', code: 'state_expired' });
    }

    // The slug came from the state row, so it was validated on the way in.
    // Re-checked because it reaches a redirect query below.
    if (!isValidSlug(pending.provider)) {
      return back(CONNECTIONS, { connection: 'error', code: 'unknown_provider' });
    }

    const record = await loadProvider(db, pending.provider);
    if (!record) return back(CONNECTIONS, { connection: 'error', code: 'unknown_provider' });
    const driver = oauthDriverFor(record);

    const { clientId, clientSecret } = oauthCredentials(driver.slug);
    const tokens = await driver.exchangeCode({
      clientId,
      clientSecret,
      redirectUri: callbackUrl(),
      code,
      codeVerifier: pending.code_verifier,
    });

    const ctx = { userId: pending.user_id, provider: driver.slug };
    const accessTokenEnc = await encryptProviderToken(tokens.accessToken, ctx);
    const refreshTokenEnc = tokens.refreshToken
      ? await encryptProviderToken(tokens.refreshToken, ctx)
      : null;

    // Only the hash is stored, so a leaked row cannot be replayed as a ticket.
    // The ticket itself exists only in the redirect below.
    const ticket = randomToken();
    const { error: parkError } = await db.from('pending_connections').insert({
      ticket_hash: await sha256Hex(ticket),
      user_id: pending.user_id,
      provider: driver.slug,
      space_id: pending.space_id,
      external_account_id: tokens.externalAccountId,
      access_token_enc: accessTokenEnc,
      refresh_token_enc: refreshTokenEnc,
      scopes: tokens.scopes.length > 0 ? tokens.scopes : driver.scopes,
      token_expires_at: tokens.expiresAt,
      return_to: pending.return_to,
      expires_at: new Date(Date.now() + PENDING_TTL_SECONDS * 1000).toISOString(),
    });
    if (parkError) {
      console.error('pending connection insert failed', parkError.message);
      return back(CONNECTIONS, {
        connection: 'error',
        code: 'store_failed',
        provider: driver.slug,
      });
    }

    // conn.exchange, not conn.link: a token exists, but no account has been
    // credited yet. connections-claim writes conn.link once one is.
    audit({
      actor: `user:${pending.user_id}`,
      action: 'conn.exchange',
      target: driver.slug,
      ip: core.ip,
      meta: { external_account_id: tokens.externalAccountId, space_id: pending.space_id },
    });

    return back(COMPLETE, { ticket, provider: driver.slug });
  } catch (err) {
    console.error('connections-callback failed', err);
    return back(CONNECTIONS, { connection: 'error', code: 'callback_failed' });
  }
});
