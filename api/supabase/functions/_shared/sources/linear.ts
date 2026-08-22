// Linear issues assigned to the wearer and still open.
//
// Linear answers GraphQL over HTTP 200 even when it refuses the token, so the
// errors array is checked as carefully as the status.

import { SourceError } from "./contract.ts";
import type { FetchDeps, ProviderCredentials } from "./contract.ts";
import { asArray, asRecord, asString, firstLine, parseInstant, requestJson } from "./common.ts";

const PROVIDER = "linear";
const ENDPOINT = "https://api.linear.app/graphql";

const RECONNECT = "reconnect linear on the connections page";
const UNAVAILABLE = "linear is not answering, this page will retry";

/**
 * One page is the count.
 *
 * Linear puts no total on a connection, so the number shown is the number of
 * open issues on this page. A wearer holding more than this many open issues
 * has a bigger problem than a badge that reads low.
 */
const ISSUE_PAGE = 100;

const ASSIGNED_ISSUES = `query AssignedIssues($first: Int!) {
  viewer {
    assignedIssues(
      first: $first
      filter: { state: { type: { nin: ["completed", "canceled"] } } }
    ) {
      nodes { title createdAt }
    }
  }
}`;

/**
 * A personal api key goes as-is, an oauth token goes as a bearer.
 *
 * Linear accepts both on the same header and tells them apart by prefix.
 */
function authorization(token: string): string {
  return token.startsWith("lin_api_") ? token : `Bearer ${token}`;
}

/** Linear tags a rejected credential in extensions.code, such as AUTHENTICATION_ERROR. */
function isAuthFailure(errors: unknown[]): boolean {
  return errors.some((raw) => {
    const code = asString(asRecord(asRecord(raw).extensions).code);
    return /auth|forbidden|permission/i.test(code);
  });
}

export async function assignedIssues(
  creds: ProviderCredentials,
  deps: FetchDeps,
): Promise<{ count: number; recent: string | null }> {
  const body = asRecord(
    await requestJson(PROVIDER, deps, ENDPOINT, {
      method: "POST",
      headers: {
        authorization: authorization(creds.accessToken),
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: ASSIGNED_ISSUES, variables: { first: ISSUE_PAGE } }),
      reconnectMessage: RECONNECT,
      failureMessage: UNAVAILABLE,
    }),
  );

  const errors = asArray(body.errors);
  if (errors.length > 0) {
    const reconnect = isAuthFailure(errors);
    throw new SourceError(PROVIDER, reconnect ? RECONNECT : UNAVAILABLE, reconnect);
  }

  const nodes = asArray(asRecord(asRecord(asRecord(body.data).viewer).assignedIssues).nodes).map(
    asRecord,
  );

  const newest = nodes
    .map((node) => ({ title: firstLine(node.title), created: parseInstant(node.createdAt) ?? 0 }))
    .sort((left, right) => right.created - left.created)[0];

  return { count: nodes.length, recent: newest?.title ?? null };
}
