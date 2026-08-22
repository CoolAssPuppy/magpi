// Slack messages that mention the wearer.
//
// Slack has no @me in its search grammar, so the wearer's own id is asked for
// first and searched as an escaped mention.

import { SourceError } from "./contract.ts";
import type { FetchDeps, ProviderCredentials } from "./contract.ts";
import { asArray, asCount, asRecord, asString, firstLine, requestJson } from "./common.ts";

const PROVIDER = "slack";
const API_BASE = "https://slack.com/api";

const RECONNECT = "reconnect slack on the connections page";
const UNAVAILABLE = "slack is not answering, this page will retry";

/** Slack error codes that a wearer fixes by connecting again. */
const REAUTH_ERRORS: readonly string[] = [
  "invalid_auth",
  "not_authed",
  "token_revoked",
  "token_expired",
  "account_inactive",
  "missing_scope",
  "no_permission",
  "not_allowed_token_type",
];

/**
 * One Slack method call.
 *
 * Slack answers 200 with `ok: false` for a revoked token, so the HTTP status
 * on its own would let a dead connection look healthy forever.
 */
async function slackCall(
  creds: ProviderCredentials,
  deps: FetchDeps,
  method: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = new URL(`${API_BASE}/${method}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const body = asRecord(
    await requestJson(PROVIDER, deps, url.toString(), {
      headers: { authorization: `Bearer ${creds.accessToken}` },
      reconnectMessage: RECONNECT,
      failureMessage: UNAVAILABLE,
    }),
  );

  if (body.ok !== true) {
    const reconnect = REAUTH_ERRORS.includes(asString(body.error));
    throw new SourceError(PROVIDER, reconnect ? RECONNECT : UNAVAILABLE, reconnect);
  }
  return body;
}

export async function mentions(
  creds: ProviderCredentials,
  deps: FetchDeps,
): Promise<{ count: number; recent: string | null }> {
  const identity = await slackCall(creds, deps, "auth.test", {});
  const userId = asString(identity.user_id);
  if (userId.length === 0) {
    throw new SourceError(PROVIDER, RECONNECT, true);
  }

  const search = await slackCall(creds, deps, "search.messages", {
    query: `<@${userId}>`,
    sort: "timestamp",
    sort_dir: "desc",
    // total carries the number; only the newest message is rendered.
    count: "1",
  });

  const messages = asRecord(search.messages);
  return {
    count: asCount(messages.total),
    recent: firstLine(asRecord(asArray(messages.matches)[0]).text),
  };
}
