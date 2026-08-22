// Notion pages waiting on the wearer.
//
// Notion has no "assigned to me" endpoint, so which pages count is a choice
// the wearer makes on the connections page. A database id in `meta` queries
// that database; without one, the integration's whole shared surface is
// searched, newest first.

import { SourceError } from "./contract.ts";
import type { FetchDeps, ProviderCredentials } from "./contract.ts";
import { asArray, asRecord, asString, firstLine, parseInstant, requestJson } from "./common.ts";

const PROVIDER = "notion";
const API = "https://api.notion.com/v1";

// Pinned. Notion routes on this header, and an unpinned client breaks on
// whatever they ship next rather than on a version bump somebody chose.
const NOTION_VERSION = "2022-06-28";

const RECONNECT = "reconnect notion on the connections page";
const UNAVAILABLE = "notion is not answering, this page will retry";

/**
 * One page of results is the count.
 *
 * Notion pages its query API and puts no total on a response, so the number
 * shown is what one page holds. A wearer with more than this many open items
 * has a bigger problem than a badge that reads low.
 */
const PAGE_SIZE = 100;

function headers(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "notion-version": NOTION_VERSION,
    "content-type": "application/json",
  };
}

/**
 * The page title, out of whichever property holds it.
 *
 * A Notion title property can be called anything, so the type is what
 * identifies it rather than the name. A page with no title reads as null and
 * the badge draws the count alone.
 */
function titleOf(page: Record<string, unknown>): string | null {
  const properties = asRecord(page.properties);
  for (const value of Object.values(properties)) {
    const property = asRecord(value);
    if (property.type !== "title") continue;
    const parts = asArray(property.title)
      .map((part) => asString(asRecord(part).plain_text))
      .join("");
    return firstLine(parts);
  }
  return null;
}

function newest(pages: Record<string, unknown>[]): Record<string, unknown> | null {
  let best: Record<string, unknown> | null = null;
  let bestAt = -Infinity;
  for (const page of pages) {
    const at = parseInstant(page.last_edited_time) ?? parseInstant(page.created_time) ?? 0;
    if (at >= bestAt) {
      bestAt = at;
      best = page;
    }
  }
  return best;
}

export interface NotionOptions {
  /** Which database to count. Absent means search everything shared with us. */
  databaseId: string | null;
}

export async function openPages(
  creds: ProviderCredentials,
  deps: FetchDeps,
  options: NotionOptions = { databaseId: readDatabaseId(creds) },
): Promise<{ count: number; recent: string | null }> {
  const databaseId = options.databaseId ?? readDatabaseId(creds);

  const url = databaseId
    ? `${API}/databases/${encodeURIComponent(databaseId)}/query`
    : `${API}/search`;

  const body = databaseId
    ? { page_size: PAGE_SIZE, sorts: [{ timestamp: "last_edited_time", direction: "descending" }] }
    : {
        page_size: PAGE_SIZE,
        filter: { value: "page", property: "object" },
        sort: { timestamp: "last_edited_time", direction: "descending" },
      };

  const answer = asRecord(
    await requestJson(PROVIDER, deps, url, {
      method: "POST",
      headers: headers(creds.accessToken),
      body: JSON.stringify(body),
      reconnectMessage: RECONNECT,
      failureMessage: UNAVAILABLE,
    }),
  );

  // Notion answers 200 with an object of type "error" for some refusals, so
  // the body is checked as carefully as the status.
  if (asString(answer.object) === "error") {
    const code = asString(answer.code);
    throw new SourceError(
      PROVIDER,
      /unauthorized|restricted|invalid_token/.test(code) ? RECONNECT : UNAVAILABLE,
      /unauthorized|restricted|invalid_token/.test(code),
    );
  }

  const pages = asArray(answer.results).map(asRecord);
  const latest = newest(pages);

  return { count: pages.length, recent: latest ? titleOf(latest) : null };
}

function readDatabaseId(creds: ProviderCredentials): string | null {
  const value = creds.meta.database_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}
