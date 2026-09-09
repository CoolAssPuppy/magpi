// POST /connections-begin. The PKCE verifier and the state stay server side in
// oauth_states; the browser receives only the URL, so a compromised page cannot
// complete the exchange.
//
// The space is chosen here, before the redirect, and travels in the state row.
// The callback therefore cannot be talked into filing the connection somewhere
// the user cannot see.

import { ApiError, jsonResponse } from '../_shared/errors.ts';
import { serveFunction } from '../_shared/http.ts';
import { connectionsBeginSchema, parseBody } from '../_shared/validate.ts';
import { audit, serviceClient } from '../_shared/db.ts';
import { enforceRateLimits } from '../_shared/rate_limit.ts';
import { requireSpaceMembership, requireUser } from '../_shared/auth.ts';
import { loadProvider, requireEnabledProvider } from '../_shared/providers.ts';
import { oauthCredentials } from '../_shared/env.ts';
import {
  callbackUrl,
  createPkce,
  createState,
  oauthDriverFor,
  safeReturnTo,
  STATE_TTL_SECONDS,
} from '../_shared/oauth.ts';

serveFunction('connections-begin', async (core) => {
  const input = parseBody(connectionsBeginSchema, core.body);
  const user = await requireUser(core.headers);
  const db = serviceClient();

  await enforceRateLimits(db, [
    { bucket: `connections-begin:user:${user.id}`, limit: 20, windowSeconds: 600 },
    { bucket: `connections-begin:ip:${core.ip}`, limit: 40, windowSeconds: 600 },
  ]);

  // Under the service role RLS enforces nothing, so membership is checked here
  // rather than assumed from the caller having named a space id.
  await requireSpaceMembership(db, user.id, input.space_id);

  // The registry decides, so disabling a provider takes effect without a deploy.
  const provider = requireEnabledProvider(await loadProvider(db, input.provider));
  const driver = oauthDriverFor(provider);

  const { clientId } = oauthCredentials(driver.slug);
  const state = createState();
  const { verifier, challengePromise } = createPkce();
  const codeChallenge = await challengePromise;

  const { error } = await db.from('oauth_states').insert({
    state,
    user_id: user.id,
    provider: driver.slug,
    code_verifier: verifier,
    space_id: input.space_id,
    return_to: safeReturnTo(input.return_to ?? null),
    expires_at: new Date(Date.now() + STATE_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) throw new ApiError(500, 'internal', 'could not start the connection');

  audit({
    actor: `user:${user.id}`,
    action: 'conn.begin',
    target: driver.slug,
    ip: core.ip,
    meta: { space_id: input.space_id, scopes: driver.scopes },
  });

  return jsonResponse({
    url: driver.buildAuthUrl({
      clientId,
      redirectUri: callbackUrl(),
      state,
      codeChallenge,
    }),
    scopes: driver.scopes,
  });
});
