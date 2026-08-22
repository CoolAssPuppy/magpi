// POST /connections-begin. The PKCE verifier and the state stay server-side in
// oauth_states; the browser receives only the URL, so a compromised page cannot
// complete the exchange.

import { ApiError, jsonResponse } from "../_shared/errors.ts";
import { serveFunction } from "../_shared/http.ts";
import { connectionsBeginSchema, parseBody } from "../_shared/validate.ts";
import { audit, enforceRateLimits, serviceClient } from "../_shared/db.ts";
import { requireUser } from "../_shared/auth.ts";
import { loadProvider, requireEnabledProvider } from "../_shared/providers.ts";
import {
  callbackUrl,
  createPkce,
  createState,
  oauthDriverFor,
  providerCredentials,
  safeReturnTo,
  STATE_TTL_SECONDS,
} from "../_shared/oauth.ts";

serveFunction("connections-begin", async (core) => {
  const input = parseBody(connectionsBeginSchema, core.body);
  const user = await requireUser(core.headers);
  const db = serviceClient();

  await enforceRateLimits(db, [
    { bucket: `connections-begin:user:${user.id}`, limit: 20, windowSeconds: 600 },
    { bucket: `connections-begin:ip:${core.ip}`, limit: 40, windowSeconds: 600 },
  ]);

  // The registry decides, so disabling a provider takes effect without a
  // deploy. oauthDriverFor refuses an api_key provider by name.
  const provider = requireEnabledProvider(await loadProvider(db, input.provider));
  const driver = oauthDriverFor(provider);

  const { clientId } = providerCredentials(driver.slug);
  const state = createState();
  const { verifier, challengePromise } = createPkce();
  const codeChallenge = await challengePromise;

  const returnTo = safeReturnTo(input.return_to ?? null);

  const { error: insertError } = await db.from("oauth_states").insert({
    state,
    user_id: user.id,
    provider: driver.slug,
    code_verifier: verifier,
    return_to: returnTo,
    expires_at: new Date(Date.now() + STATE_TTL_SECONDS * 1000).toISOString(),
  });
  if (insertError) throw new ApiError(500, "internal", "could not start the connection");

  audit({
    actor: `user:${user.id}`,
    action: "conn.begin",
    target: driver.slug,
    ip: core.ip,
    meta: { scopes: driver.scopes },
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
