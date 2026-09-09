// Notion, read through search for what changed and block children for the text.
//
// A Notion integration token is scoped to one workspace and does not expire,
// which is why this driver offers a single scope option and no refresh.

import type {
  ChangePage,
  FetchedDocument,
  RefreshOutcome,
  ScopeOption,
  SourceCredentials,
  SourceDeps,
  SourceDocumentRef,
  SourceDriver,
} from './contract.ts';
import { SourceError } from './contract.ts';
import { asArray, asRecord, asString, isoStamp, parseInstant, requestJson } from './common.ts';

const PROVIDER = 'notion';
const API = 'https://api.notion.com/v1';
const MIME = 'text/markdown';
const PAGE_SIZE = 100;

// Notion serves a different response shape per version and picks the
// integration's default when the header is absent, so an unpinned driver can
// break on a day nobody deployed anything.
const NOTION_VERSION = '2022-06-28';

// A pass reads at most this many requests of PAGE_SIZE. A first pass over a
// large workspace would otherwise run until the function is killed, and an
// incremental pass that finds no page older than its cursor would walk the
// whole history to prove it.
const MAX_REQUESTS = 5;

const RECONNECT_MESSAGE = 'Notion refused this connection, reconnect it';
const FAILURE_MESSAGE = 'Notion could not be read, the next sync will try again';

/** Notion error codes that mean the credential, not the moment, is the problem. */
const RECONNECT_CODES = /unauthorized|restricted|invalid_token/;

function headers(creds: SourceCredentials, extra: Record<string, string> = {}) {
  return {
    authorization: `Bearer ${creds.accessToken}`,
    'notion-version': NOTION_VERSION,
    ...extra,
  };
}

/**
 * Notion answers some refusals with HTTP 200 and an error object, so a status
 * check alone reads a refused token as an empty workspace.
 */
function readBody(payload: unknown): Record<string, unknown> {
  const record = asRecord(payload);
  if (asString(record.object) !== 'error') return record;

  // The provider's own wording never reaches the message: an error body can
  // quote the request, and the request carries the token.
  const needsReconnect = RECONNECT_CODES.test(asString(record.code));
  throw new SourceError(
    PROVIDER,
    needsReconnect ? RECONNECT_MESSAGE : FAILURE_MESSAGE,
    needsReconnect,
  );
}

async function getJson(
  creds: SourceCredentials,
  deps: SourceDeps,
  url: string,
): Promise<Record<string, unknown>> {
  return readBody(
    await requestJson(PROVIDER, deps, url, {
      headers: headers(creds),
      reconnectMessage: RECONNECT_MESSAGE,
      failureMessage: FAILURE_MESSAGE,
    }),
  );
}

async function postJson(
  creds: SourceCredentials,
  deps: SourceDeps,
  url: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return readBody(
    await requestJson(PROVIDER, deps, url, {
      method: 'POST',
      headers: headers(creds, { 'content-type': 'application/json' }),
      body: JSON.stringify(body),
      reconnectMessage: RECONNECT_MESSAGE,
      failureMessage: FAILURE_MESSAGE,
    }),
  );
}

function searchBody(startCursor: string | null): Record<string, unknown> {
  const body: Record<string, unknown> = {
    page_size: PAGE_SIZE,
    filter: { value: 'page', property: 'object' },
    sort: { timestamp: 'last_edited_time', direction: 'descending' },
  };
  // Notion validates start_cursor when it is present, so a first pass omits it
  // rather than sending null.
  if (startCursor !== null) body.start_cursor = startCursor;
  return body;
}

function plainText(value: unknown): string {
  return asArray(value)
    .map((span) => asString(asRecord(span).plain_text))
    .join('')
    .trim();
}

/** A title property can be named anything, so its type is what identifies it. */
function pageTitle(page: Record<string, unknown>): string {
  for (const value of Object.values(asRecord(page.properties))) {
    const property = asRecord(value);
    if (asString(property.type) !== 'title') continue;
    const text = plainText(property.title);
    if (text.length > 0) return text;
  }
  return 'Untitled';
}

function toRef(page: Record<string, unknown>, deps: SourceDeps): SourceDocumentRef {
  return {
    externalId: asString(page.id),
    title: pageTitle(page),
    url: asString(page.url) || null,
    mimeType: MIME,
    updatedAt: isoStamp(page.last_edited_time, deps),
  };
}

interface Walked {
  pages: Record<string, unknown>[];
  reachedCursor: boolean;
}

/** Pages newer than the cursor, and whether the walk met one that is not. */
function takeNewerThan(results: unknown[], since: number | null): Walked {
  const pages: Record<string, unknown>[] = [];
  for (const raw of results) {
    const page = asRecord(raw);
    const edited = parseInstant(page.last_edited_time);
    // Results arrive newest first, so the first page at or below the cursor ends
    // the pass: everything behind it was ingested by an earlier one.
    if (since !== null && edited !== null && edited <= since) {
      return { pages, reachedCursor: true };
    }
    pages.push(page);
  }
  return { pages, reachedCursor: false };
}

/** Every stamp here came from isoStamp, so these strings sort as their instants do. */
function newestStamp(documents: SourceDocumentRef[]): string | null {
  let newest: string | null = null;
  for (const doc of documents) {
    if (newest === null || doc.updatedAt > newest) newest = doc.updatedAt;
  }
  return newest;
}

async function listChanges(
  creds: SourceCredentials,
  deps: SourceDeps,
  input: { cursor: string | null },
): Promise<ChangePage> {
  const since = parseInstant(input.cursor);
  const documents: SourceDocumentRef[] = [];
  let startCursor: string | null = null;
  let hasMore = false;

  for (let request = 0; request < MAX_REQUESTS; request++) {
    const body = await postJson(creds, deps, `${API}/search`, searchBody(startCursor));
    const walked = takeNewerThan(asArray(body.results), since);
    for (const page of walked.pages) documents.push(toRef(page, deps));

    const next = asString(body.next_cursor);
    hasMore = !walked.reachedCursor && body.has_more === true && next.length > 0;
    if (!hasMore) break;
    startCursor = next;
  }

  return { documents, cursor: newestStamp(documents) ?? input.cursor, hasMore };
}

const BLOCK_PREFIXES = new Map<string, string>([
  ['paragraph', ''],
  ['heading_1', '# '],
  ['heading_2', '## '],
  ['heading_3', '### '],
  ['bulleted_list_item', '- '],
  ['numbered_list_item', '- '],
  ['to_do', '- '],
  ['quote', ''],
  ['callout', ''],
  ['code', ''],
]);

function blockLine(block: Record<string, unknown>): string | null {
  const type = asString(block.type);
  const prefix = BLOCK_PREFIXES.get(type);
  // Notion adds block types faster than a driver learns them, and an embed or an
  // image has no text to chunk, so an unrecognised type is skipped rather than
  // treated as a fault.
  if (prefix === undefined) return null;

  const text = plainText(asRecord(block[type]).rich_text);
  return text.length > 0 ? `${prefix}${text}` : null;
}

function blocksUrl(externalId: string, startCursor: string | null): string {
  const url = new URL(`${API}/blocks/${encodeURIComponent(externalId)}/children`);
  url.searchParams.set('page_size', String(PAGE_SIZE));
  if (startCursor !== null) url.searchParams.set('start_cursor', startCursor);
  return url.toString();
}

async function readBlockText(
  creds: SourceCredentials,
  deps: SourceDeps,
  externalId: string,
): Promise<string> {
  const lines: string[] = [];
  let startCursor: string | null = null;

  for (let request = 0; request < MAX_REQUESTS; request++) {
    const body = await getJson(creds, deps, blocksUrl(externalId, startCursor));
    for (const raw of asArray(body.results)) {
      const line = blockLine(asRecord(raw));
      if (line !== null) lines.push(line);
    }

    const next = asString(body.next_cursor);
    if (body.has_more !== true || next.length === 0) break;
    startCursor = next;
  }

  return lines.join('\n');
}

async function fetchDocument(
  creds: SourceCredentials,
  deps: SourceDeps,
  externalId: string,
): Promise<FetchedDocument> {
  const page = await getJson(creds, deps, `${API}/pages/${encodeURIComponent(externalId)}`);
  const ref = toRef(page, deps);

  return {
    ...ref,
    externalId: ref.externalId || externalId,
    mimeType: MIME,
    text: await readBlockText(creds, deps, externalId),
  };
}

async function listScopeOptions(
  creds: SourceCredentials,
  deps: SourceDeps,
): Promise<ScopeOption[]> {
  const me = await getJson(creds, deps, `${API}/users/me`);
  const bot = asRecord(me.bot);

  // A token reaches exactly one workspace, so the picker offers that one or
  // nothing. Older responses omit workspace_id, and the bot id names the same
  // connection.
  const botId = asString(me.id);
  const id = asString(bot.workspace_id) || botId;
  const name = asString(bot.workspace_name) || botId;
  if (id.length === 0 || name.length === 0) return [];

  return [{ id, name, kind: 'workspace' }];
}

export const notionDriver: SourceDriver = {
  provider: PROVIDER,
  scopeSelectionKind: 'workspace',
  listChanges,
  fetchDocument,
  listScopeOptions,
  refresh(): Promise<RefreshOutcome> {
    // Notion issues non-expiring access tokens, so there is no grant to make and
    // a request here could only fail.
    return Promise.resolve({ kind: 'not_supported' });
  },
};
