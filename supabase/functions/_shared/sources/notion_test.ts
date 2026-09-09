import { assert, assertEquals } from '@std/assert';

import type { SourceCredentials } from './contract.ts';
import { SourceError } from './contract.ts';
import { loadFixture, stubAnswering, type StubRoute, stubSource } from './testing/http_stub.ts';
import { notionDriver } from './notion.ts';

const CREDS: SourceCredentials = {
  accessToken: 'ntn_fixture_token',
  scopeSelection: { ids: [] },
};

const PAGE_ID = '5f2c1a90-3b47-4a0e-9d21-8c6b4e77a101';

/** Routes both search pages, told apart by the cursor the first one hands back. */
async function searchRoutes(): Promise<StubRoute[]> {
  const [first, second] = await Promise.all([
    loadFixture('notion', 'search_page_1'),
    loadFixture('notion', 'search_page_2'),
  ]);
  return [
    {
      when: (call) =>
        call.url.endsWith('/v1/search') && (call.body ?? '').includes('cursor_lumen_page_2'),
      body: second,
    },
    { when: (call) => call.url.endsWith('/v1/search'), body: first },
  ];
}

async function documentRoutes(): Promise<StubRoute[]> {
  const [page, blocksOne, blocksTwo] = await Promise.all([
    loadFixture('notion', 'page'),
    loadFixture('notion', 'blocks_page_1'),
    loadFixture('notion', 'blocks_page_2'),
  ]);
  return [
    { when: (call) => call.url.includes('start_cursor=cursor_lumen_blocks_2'), body: blocksTwo },
    { when: (call) => call.url.includes(`/blocks/${PAGE_ID}/children`), body: blocksOne },
    { when: (call) => call.url.endsWith(`/pages/${PAGE_ID}`), body: page },
  ];
}

async function refusalStub(fixture: string) {
  return stubSource([{
    when: () => true,
    status: 200,
    body: await loadFixture('notion', fixture),
  }]);
}

Deno.test('a first pass follows next_cursor and pins the api version', async () => {
  const stub = stubSource(await searchRoutes());
  const page = await notionDriver.listChanges(CREDS, stub, { cursor: null });

  assertEquals(stub.calls.length, 2);
  assertEquals(stub.calls[0].method, 'POST');
  assertEquals(stub.calls[0].headers['notion-version'], '2022-06-28');
  assertEquals(stub.calls[0].headers['authorization'], 'Bearer ntn_fixture_token');
  assertEquals(stub.calls[0].headers['content-type'], 'application/json');
  assert(!(stub.calls[0].body ?? '').includes('start_cursor'));
  assert((stub.calls[1].body ?? '').includes('"start_cursor":"cursor_lumen_page_2"'));
  assertEquals(page.documents.length, 5);
  assertEquals(page.hasMore, false);
  assertEquals(page.documents[0].mimeType, 'text/markdown');
  assertEquals(
    page.documents[0].url,
    'https://www.notion.so/lumenlabs/Onboarding-checklist-5f2c1a903b474a0e9d218c6b4e77a101',
  );
});

Deno.test('the cursor is the newest last_edited_time the pass saw', async () => {
  const stub = stubSource(await searchRoutes());
  const page = await notionDriver.listChanges(CREDS, stub, { cursor: null });

  assertEquals(page.cursor, '2026-09-08T17:45:00.000Z');
  assertEquals(page.documents[0].updatedAt, '2026-09-08T17:45:00.000Z');
});

Deno.test('an incremental pass stops at the cursor instead of walking the workspace', async () => {
  const stub = stubSource(await searchRoutes());
  const page = await notionDriver.listChanges(CREDS, stub, { cursor: '2026-09-06T00:00:00.000Z' });

  assertEquals(stub.calls.length, 1);
  assertEquals(page.documents.map((doc) => doc.title), [
    'Onboarding checklist',
    'Incident review: cache stampede',
  ]);
  assertEquals(page.cursor, '2026-09-08T17:45:00.000Z');
  assertEquals(page.hasMore, false);
});

Deno.test('a pass that finds nothing new keeps the cursor it was handed', async () => {
  const stub = stubSource(await searchRoutes());
  const page = await notionDriver.listChanges(CREDS, stub, { cursor: '2026-09-09T00:00:00.000Z' });

  assertEquals(page.documents, []);
  assertEquals(page.cursor, '2026-09-09T00:00:00.000Z');
  assertEquals(page.hasMore, false);
});

Deno.test('a title comes from the title-typed property whatever it is named', async () => {
  const stub = stubSource(await searchRoutes());
  const page = await notionDriver.listChanges(CREDS, stub, { cursor: null });

  // The fixture names its title properties "Doc name", "Name" and "Page".
  assertEquals(page.documents[0].title, 'Onboarding checklist');
  assertEquals(page.documents[1].title, 'Incident review: cache stampede');
  assertEquals(page.documents[2].title, 'Untitled');
});

Deno.test('block text is one line per block and skips types with no text', async () => {
  const stub = stubSource(await documentRoutes());
  const doc = await notionDriver.fetchDocument(CREDS, stub, PAGE_ID);

  assertEquals(stub.calls.length, 3);
  assertEquals(doc.externalId, PAGE_ID);
  assertEquals(doc.title, 'Onboarding checklist');
  assertEquals(doc.mimeType, 'text/markdown');
  assertEquals(doc.text.split('\n'), [
    '# Onboarding checklist',
    'Everything a new engineer at Lumen Labs needs in week one.',
    '- Request access to the staging cluster',
    '## Week two',
    '- Pair with your onboarding buddy',
    'deno task test',
    'Write it down or it did not happen.',
  ]);
  // The image block between them contributed nothing.
  assert(!doc.text.includes('notion-static'));
});

Deno.test('a refusal answered with http 200 asks for a reconnect', async () => {
  const stub = await refusalStub('error_unauthorized');
  try {
    await notionDriver.listChanges(CREDS, stub, { cursor: null });
    throw new Error('did not raise');
  } catch (err) {
    assert(err instanceof SourceError);
    assertEquals(err.needsReconnect, true);
    assert(!err.message.includes(CREDS.accessToken));
    assert(!err.message.includes('API token is invalid'));
  }
});

Deno.test('a http 200 refusal that is not about the credential does not ask for a reconnect', async () => {
  const stub = await refusalStub('error_rate_limited');
  try {
    await notionDriver.fetchDocument(CREDS, stub, PAGE_ID);
    throw new Error('did not raise');
  } catch (err) {
    assert(err instanceof SourceError);
    assertEquals(err.needsReconnect, false);
  }
});

Deno.test('the scope picker offers the one workspace the token reaches', async () => {
  const stub = stubSource([
    {
      when: (call) => call.url.endsWith('/users/me'),
      body: await loadFixture('notion', 'users_me'),
    },
  ]);
  const options = await notionDriver.listScopeOptions(CREDS, stub);

  assertEquals(options, [{
    id: '7c4d2ea1-9f36-4b58-8d0a-2e5f1c9b7d44',
    name: 'Lumen Labs Handbook',
    kind: 'workspace',
  }]);
  assertEquals(notionDriver.scopeSelectionKind, 'workspace');
});

Deno.test('an answer with no workspace in it offers nothing to pick', async () => {
  const options = await notionDriver.listScopeOptions(CREDS, stubAnswering(200, {}));
  assertEquals(options, []);
});

Deno.test('refresh does not ask notion for a token it never expires', async () => {
  const stub = stubAnswering(200, {});
  const outcome = await notionDriver.refresh(stub, {
    refreshToken: 'rt_fixture',
    clientId: 'client',
    clientSecret: 'secret',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
  });

  assertEquals(outcome.kind, 'not_supported');
  assertEquals(stub.calls.length, 0);
});
