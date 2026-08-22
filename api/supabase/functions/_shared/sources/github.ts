// Pull requests waiting on the wearer's review.
//
// The search API resolves @me against the token, so no separate call is needed
// to learn who the wearer is.

import type { FetchDeps, ProviderCredentials } from "./contract.ts";
import { asArray, asCount, asRecord, firstLine, requestJson } from "./common.ts";

const PROVIDER = "github";
const ENDPOINT = "https://api.github.com/search/issues";
const QUERY = "is:open is:pr review-requested:@me";

const RECONNECT = "reconnect github on the connections page";
const UNAVAILABLE = "github is not answering, this page will retry";

export async function reviewRequests(
  creds: ProviderCredentials,
  deps: FetchDeps,
): Promise<{ count: number; recent: string | null }> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("q", QUERY);
  url.searchParams.set("sort", "created");
  url.searchParams.set("order", "desc");
  // total_count carries the number; only the newest title is rendered.
  url.searchParams.set("per_page", "1");

  const body = asRecord(
    await requestJson(PROVIDER, deps, url.toString(), {
      headers: {
        authorization: `Bearer ${creds.accessToken}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "magpi-badge",
      },
      reconnectMessage: RECONNECT,
      failureMessage: UNAVAILABLE,
    }),
  );

  return {
    count: asCount(body.total_count),
    recent: firstLine(asRecord(asArray(body.items)[0]).title),
  };
}
