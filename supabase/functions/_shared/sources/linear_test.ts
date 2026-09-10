import { assert, assertEquals } from '@std/assert';

import type { SourceCredentials } from './contract.ts';
import { SourceError } from './contract.ts';
import { asArray, asRecord, asString } from './common.ts';
import { linearDriver } from './linear.ts';
import { loadFixture, type StubCall, type StubRoute, stubSource } from './testing/http_stub.ts';

const ENDPOINT = 'https://api.linear.app/graphql';
const API_KEY = 'lin_api_7b4c2f90e1a84d63b0f5';
const OAUTH_TOKEN = 'lin_oauth_9f31c07a4b6d48e2b5c1';

const KNOWLEDGE_BASE_TEAM = '8d1f6c40-3b72-4e95-9a08-51cd7e2b6a37';
const PLATFORM_TEAM = 'a5e2b719-6c84-4f13-8d70-2b96e0af4c58';

function creds(overrides: Partial<SourceCredentials> = {}): SourceCredentials {
  return { accessToken: API_KEY, scopeSelection: { ids: [] }, ...overrides };
}

/** Reads the outgoing request the way the driver reads an incoming one. */
function variablesOf(call: StubCall): Record<string, unknown> {
  return asRecord(asRecord(parseJson(call.body)).variables);
}

/** A refresh posts a form body, which is not the driver's fault and not JSON. */
function parseJson(body: string | null): unknown {
  try {
    return JSON.parse(body ?? 'null');
  } catch {
    return null;
  }
}

function filterOf(call: StubCall): Record<string, unknown> {
  return asRecord(variablesOf(call).filter);
}

/** True for the request that opens a walk, which is the one a recorded page answers. */
function isFirstPage(call: StubCall): boolean {
  return asString(variablesOf(call).after).length === 0;
}

/** One recorded page, then the empty page a walk ends on. */
async function answering(body: unknown) {
  return stubSource([
    { when: isFirstPage, body },
    { when: () => true, body: await loadFixture('linear', 'changes_empty') },
  ]);
}

/** The recorded backlog, each page answered to the cursor that asks for it. */
async function backlogRoutes(): Promise<StubRoute[]> {
  const chain = asRecord(await loadFixture('linear', 'changes_backlog'));
  return Object.entries(chain).map(([after, body]) => ({
    when: (call: StubCall) => asString(variablesOf(call).after) === after,
    body,
  }));
}

Deno.test('a first pass asks for everything, with no updatedAt clause', async () => {
  const deps = await answering(await loadFixture('linear', 'changes_first'));

  const page = await linearDriver.listChanges(creds(), deps, { cursor: null });

  assertEquals(deps.calls[0].url, ENDPOINT);
  assertEquals(deps.calls[0].method, 'POST');
  assertEquals(variablesOf(deps.calls[0]).filter, null);
  assertEquals(variablesOf(deps.calls[0]).first, 50);
  assertEquals(variablesOf(deps.calls[0]).after, null);
  // The pass walks on from the page it was given rather than stopping there.
  assertEquals(variablesOf(deps.calls[1]).after, 'eyJvZmZzZXQiOjN9');
  assertEquals(page.documents.length, 3);
  assertEquals(page.hasMore, false);
});

Deno.test('an incremental pass filters on the cursor it was handed', async () => {
  const deps = await answering(await loadFixture('linear', 'changes_incremental'));
  const cursor = '2026-09-08T16:41:05.902Z';

  await linearDriver.listChanges(creds(), deps, { cursor });

  assertEquals(asRecord(filterOf(deps.calls[0]).updatedAt).gt, cursor);
});

Deno.test('a workspace larger than one pass resumes into the backlog', async () => {
  const routes = await backlogRoutes();

  const first = stubSource(routes);
  const firstPass = await linearDriver.listChanges(creds(), first, { cursor: null });

  assertEquals(first.calls.length, 5);
  assertEquals(firstPass.hasMore, true);
  assertEquals(firstPass.documents.map((document) => document.externalId), [
    '3f8c1a92-5d47-4c1b-9f0e-2a6b71d4c803',
    'b21d4e07-8c3a-49f6-a5d2-6e91f0c7ab54',
    'c7a90b13-2f65-4d88-b1c4-90de5a2f7611',
    'e40f2b8d-71c9-4a35-8b26-0d7e93f5c122',
    'f18c30a6-9b47-4d02-8e51-27ca6f9b3d70',
  ]);

  const second = stubSource(routes);
  const secondPass = await linearDriver.listChanges(creds(), second, { cursor: firstPass.cursor });

  assertEquals(variablesOf(second.calls[0]).after, 'eyJvZmZzZXQiOjV9');
  // The walk covers the page whichever direction the provider ordered updatedAt in.
  assertEquals(secondPass.documents.map((document) => document.externalId), [
    '0a5e94c2-6d81-43f7-b39e-84c107f2a6bd',
    '6d2b81f4-0c53-49ae-97b2-5f8e30d1c47a',
  ]);
  assertEquals(second.calls.length, 2);
  assertEquals(secondPass.hasMore, false);
  // The walk settles on the newest issue it saw across both passes.
  assertEquals(secondPass.cursor, '2026-09-09T07:02:44.130Z');

  const third = stubSource(routes);
  await linearDriver.listChanges(creds(), third, { cursor: secondPass.cursor });

  assertEquals(variablesOf(third.calls[0]).after, null);
  assertEquals(asRecord(filterOf(third.calls[0]).updatedAt).gt, '2026-09-09T07:02:44.130Z');
});

Deno.test('a citation carries the issue identifier and the issue url', async () => {
  const deps = await answering(await loadFixture('linear', 'changes_first'));

  const page = await linearDriver.listChanges(creds(), deps, { cursor: null });

  assertEquals(page.documents[0].externalId, '3f8c1a92-5d47-4c1b-9f0e-2a6b71d4c803');
  assertEquals(
    page.documents[0].title,
    'KB-118 Search returns stale titles after a page is renamed',
  );
  assertEquals(page.documents[0].mimeType, 'text/markdown');
  assert(
    asString(page.documents[0].url).endsWith(
      '/KB-118/search-returns-stale-titles-after-a-page-is-renamed',
    ),
  );
});

Deno.test('an issue carries the team it belongs to', async () => {
  const deps = await answering(await loadFixture('linear', 'changes_first'));

  const page = await linearDriver.listChanges(creds(), deps, { cursor: null });

  // KB-118 and KB-121 are Knowledge Base issues, PLT-64 is a Platform one.
  assertEquals(page.documents.map((document) => document.unitId), [
    KNOWLEDGE_BASE_TEAM,
    KNOWLEDGE_BASE_TEAM,
    PLATFORM_TEAM,
  ]);
});

Deno.test('the next pass resumes from the newest updatedAt in the page', async () => {
  const deps = await answering(await loadFixture('linear', 'changes_incremental'));

  const page = await linearDriver.listChanges(creds(), deps, {
    cursor: '2026-09-08T16:41:05.902Z',
  });

  assertEquals(page.cursor, '2026-09-09T11:18:07.556Z');
  assertEquals(page.hasMore, false);
});

Deno.test('a quiet connection keeps the cursor it came in with', async () => {
  const deps = await answering(await loadFixture('linear', 'changes_empty'));
  const cursor = '2026-09-09T11:18:07.556Z';

  const page = await linearDriver.listChanges(creds(), deps, { cursor });

  assertEquals(page.documents, []);
  assertEquals(page.cursor, cursor);
});

Deno.test('a connection reads only the teams it selected', async () => {
  const selected = await answering(await loadFixture('linear', 'changes_first'));
  await linearDriver.listChanges(
    creds({ scopeSelection: { ids: [KNOWLEDGE_BASE_TEAM] } }),
    selected,
    { cursor: null },
  );
  assertEquals(asArray(asRecord(asRecord(filterOf(selected.calls[0]).team).id).in), [
    KNOWLEDGE_BASE_TEAM,
  ]);

  const unselected = await answering(await loadFixture('linear', 'changes_first'));
  await linearDriver.listChanges(creds(), unselected, { cursor: '2026-09-01T00:00:00.000Z' });
  assertEquals(filterOf(unselected.calls[0]).team, undefined);
});

Deno.test('a personal api key is sent as the whole authorization header', async () => {
  const deps = await answering(await loadFixture('linear', 'teams'));

  await linearDriver.listScopeOptions(creds(), deps);

  assertEquals(deps.calls[0].headers.authorization, API_KEY);
});

Deno.test('an oauth token is sent as a bearer credential', async () => {
  const deps = await answering(await loadFixture('linear', 'teams'));

  await linearDriver.listScopeOptions(creds({ accessToken: OAUTH_TOKEN }), deps);

  assertEquals(deps.calls[0].headers.authorization, `Bearer ${OAUTH_TOKEN}`);
});

Deno.test('a document is the description followed by each named comment', async () => {
  const deps = await answering(await loadFixture('linear', 'issue'));

  const document = await linearDriver.fetchDocument(
    creds(),
    deps,
    'b21d4e07-8c3a-49f6-a5d2-6e91f0c7ab54',
  );

  assertEquals(document.title, 'KB-121 Write the retention policy for archived handbook pages');
  assertEquals(document.mimeType, 'text/markdown');
  assertEquals(document.unitId, KNOWLEDGE_BASE_TEAM);
  assert(document.text.startsWith('Archived handbook pages stay in the index forever'));
  const nadia = document.text.indexOf('\n\nNadia Okonkwo: Legal wants two years');
  const tomas = document.text.indexOf('\n\nTomas Ferreira: Ninety days works');
  assert(nadia > 0, 'the first comment is missing');
  assert(tomas > nadia, 'the comments are out of order');
});

Deno.test('an issue that is gone does not ask for a needless reconnect', async () => {
  const deps = await answering(await loadFixture('linear', 'issue_missing'));

  try {
    await linearDriver.fetchDocument(creds(), deps, 'deleted-issue');
    throw new Error('did not raise');
  } catch (err) {
    assert(err instanceof SourceError);
    assertEquals(err.needsReconnect, false);
  }
});

Deno.test('a credential error inside a 200 still asks for a reconnect', async () => {
  const deps = await answering(await loadFixture('linear', 'error_authentication'));

  try {
    await linearDriver.listChanges(creds(), deps, { cursor: null });
    throw new Error('did not raise');
  } catch (err) {
    assert(err instanceof SourceError);
    assertEquals(err.needsReconnect, true);
    // Linear's own wording quotes the request, and the request carries the token.
    assert(!err.message.includes('Authentication required'));
  }
});

Deno.test('a rate limit inside a 200 leaves the connection alone', async () => {
  const deps = await answering(await loadFixture('linear', 'error_rate_limited'));

  try {
    await linearDriver.listChanges(creds(), deps, { cursor: null });
    throw new Error('did not raise');
  } catch (err) {
    assert(err instanceof SourceError);
    assertEquals(err.needsReconnect, false);
  }
});

Deno.test('the scope picker offers the workspace teams', async () => {
  const deps = await answering(await loadFixture('linear', 'teams'));

  const options = await linearDriver.listScopeOptions(creds(), deps);

  assertEquals(options.length, 3);
  assertEquals(options[0], {
    id: KNOWLEDGE_BASE_TEAM,
    name: 'Knowledge Base',
  });
  assertEquals(variablesOf(deps.calls[0]).first, 100);
});

Deno.test('a refresh goes to the token endpoint it was handed', async () => {
  const deps = await answering(await loadFixture('linear', 'token_refreshed'));
  const tokenUrl = 'https://api.linear.app/oauth/token';

  const outcome = await linearDriver.refresh(deps, {
    refreshToken: 'lin_refresh_old',
    clientId: 'client_1',
    clientSecret: 'secret_1',
    tokenUrl,
  });

  assertEquals(deps.calls[0].url, tokenUrl);
  assertEquals(outcome.kind, 'refreshed');
  if (outcome.kind !== 'refreshed') return;
  assertEquals(outcome.accessToken, OAUTH_TOKEN);
  // Linear rotates the refresh token on every renewal, so the new one is stored.
  assertEquals(outcome.refreshToken, 'lin_refresh_2c84f6a1d09b47e3a7f5');
  assertEquals(outcome.expiresAt, '2026-09-09T13:00:00.000Z');
});

Deno.test('the driver names itself for the registry', () => {
  assertEquals(linearDriver.provider, 'linear');
  assertEquals(linearDriver.scopeSelectionKind, 'workspace');
});
