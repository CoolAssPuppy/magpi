import { assert, assertEquals } from '@std/assert';

import type { RefreshInput, SourceCredentials } from './contract.ts';
import { SourceError } from './contract.ts';
import { slackDriver } from './slack.ts';
import { loadFixture, type StubCall, type StubRoute, stubSource } from './testing/http_stub.ts';

const AURORA = 'C0KB1AURORA';
const BEACON = 'C0KB2BEACON';

function creds(ids: string[]): SourceCredentials {
  return { accessToken: 'xoxp-fixture-token', scopeSelection: { ids } };
}

function isMethod(call: StubCall, method: string): boolean {
  return new URL(call.url).pathname === `/api/${method}`;
}

function paramOf(call: StubCall, name: string): string | null {
  return new URL(call.url).searchParams.get(name);
}

function historyRoute(channel: string, body: unknown): StubRoute {
  return {
    when: (call) => isMethod(call, 'conversations.history') && paramOf(call, 'channel') === channel,
    body,
  };
}

async function historyRoutes(): Promise<StubRoute[]> {
  return [
    historyRoute(AURORA, await loadFixture('slack', 'history_aurora_first')),
    historyRoute(BEACON, await loadFixture('slack', 'history_beacon_first')),
  ];
}

const REFRESH_INPUT: RefreshInput = {
  refreshToken: 'rt_unused',
  clientId: 'id',
  clientSecret: 'secret',
  tokenUrl: 'https://slack.com/api/oauth.v2.access',
};

Deno.test('a first pass reads every selected channel and skips system messages', async () => {
  const stub = stubSource(await historyRoutes());

  const page = await slackDriver.listChanges(creds([AURORA, BEACON]), stub, { cursor: null });

  assertEquals(stub.calls.length, 2);
  assertEquals(page.hasMore, false);
  // The join event in the aurora fixture is not something somebody said.
  assertEquals(page.documents.length, 6);
  assertEquals(page.documents[0].externalId, `${AURORA}:1788954450.000200`);
  assertEquals(page.documents[0].title, 'Reindex runbook is written up at last.');
  assertEquals(page.documents[0].mimeType, 'text/plain');
  assertEquals(page.documents[0].url, null);
  assert(!page.documents.some((doc) => doc.externalId.endsWith('1788946245.000300')));
});

Deno.test('a first pass sends no oldest and carries the bearer token', async () => {
  const stub = stubSource(await historyRoutes());

  await slackDriver.listChanges(creds([AURORA, BEACON]), stub, { cursor: null });

  for (const call of stub.calls) {
    assertEquals(paramOf(call, 'oldest'), null);
    assertEquals(paramOf(call, 'limit'), '200');
    assertEquals(paramOf(call, 'inclusive'), 'false');
    assertEquals(call.headers.authorization, 'Bearer xoxp-fixture-token');
  }
});

Deno.test('a message with no text falls back to a title naming the channel', async () => {
  const stub = stubSource(await historyRoutes());

  const page = await slackDriver.listChanges(creds([AURORA]), stub, { cursor: null });

  const shared = page.documents.find((doc) => doc.externalId.endsWith('1788952600.000600'));
  assertEquals(shared?.title, `Message in ${AURORA}`);
});

Deno.test('a slack ts becomes an rfc 3339 stamp', async () => {
  const stub = stubSource(await historyRoutes());

  const page = await slackDriver.listChanges(creds([AURORA, BEACON]), stub, { cursor: null });

  assertEquals(page.documents[0].updatedAt, '2026-09-09T11:47:30.000Z');
  const oldest = page.documents.find((doc) => doc.externalId.endsWith('1788858843.000900'));
  assertEquals(oldest?.updatedAt, '2026-09-08T09:14:03.000Z');
});

Deno.test('the returned cursor holds the newest ts per channel', async () => {
  const stub = stubSource(await historyRoutes());

  const page = await slackDriver.listChanges(creds([AURORA, BEACON]), stub, { cursor: null });

  assertEquals(JSON.parse(page.cursor ?? 'null'), {
    [AURORA]: '1788954450.000200',
    [BEACON]: '1788885682.000400',
  });
});

Deno.test('an incremental pass sends each channel its own oldest', async () => {
  const stub = stubSource([
    historyRoute(AURORA, await loadFixture('slack', 'history_aurora_incremental')),
    historyRoute(BEACON, await loadFixture('slack', 'history_beacon_empty')),
  ]);
  const cursor = JSON.stringify({
    [AURORA]: '1788954450.000200',
    [BEACON]: '1788885682.000400',
  });

  const page = await slackDriver.listChanges(creds([AURORA, BEACON]), stub, { cursor });

  const sent = new Map(
    stub.calls.map((call) => [paramOf(call, 'channel'), paramOf(call, 'oldest')]),
  );
  assertEquals(sent.get(AURORA), '1788954450.000200');
  assertEquals(sent.get(BEACON), '1788885682.000400');
  assertEquals(page.documents.length, 1);
  assertEquals(page.documents[0].externalId, `${AURORA}:1788955080.000500`);
  // A channel with nothing new keeps the mark it arrived with.
  assertEquals(JSON.parse(page.cursor ?? 'null'), {
    [AURORA]: '1788955080.000500',
    [BEACON]: '1788885682.000400',
  });
});

Deno.test('a cursor that will not parse reads as a first pass', async () => {
  const stub = stubSource(await historyRoutes());

  const page = await slackDriver.listChanges(creds([AURORA]), stub, { cursor: 'not json at all' });

  assertEquals(paramOf(stub.calls[0], 'oldest'), null);
  assertEquals(page.documents.length, 4);
});

Deno.test('a connection with no channels picked makes no request', async () => {
  const stub = stubSource([]);

  const page = await slackDriver.listChanges(creds([]), stub, { cursor: null });

  assertEquals(stub.calls.length, 0);
  assertEquals(page.documents, []);
  assertEquals(page.cursor, null);
  assertEquals(page.hasMore, false);
});

Deno.test('a selection longer than the cap reads the stalest channels first', async () => {
  const stub = stubSource([
    { when: () => true, body: await loadFixture('slack', 'history_beacon_empty') },
  ]);
  const ids = Array.from({ length: 25 }, (_, index) => `C0KB${index}`);
  // Everything but the last two has already been read up to date.
  const marks: Record<string, string> = {};
  for (const id of ids.slice(0, 23)) marks[id] = '1788954450.000200';

  const page = await slackDriver.listChanges(creds(ids), stub, { cursor: JSON.stringify(marks) });

  assertEquals(stub.calls.length, 20);
  assertEquals(page.hasMore, true);
  const read = stub.calls.map((call) => paramOf(call, 'channel'));
  assertEquals(read.slice(0, 2), ['C0KB23', 'C0KB24']);
});

Deno.test('a thread is fetched as the parent followed by each reply', async () => {
  const stub = stubSource([
    {
      when: (call) => isMethod(call, 'conversations.replies'),
      body: await loadFixture('slack', 'replies_runbook_thread'),
    },
  ]);

  const doc = await slackDriver.fetchDocument(
    creds([AURORA]),
    stub,
    `${AURORA}:1788954450.000200`,
  );

  assertEquals(paramOf(stub.calls[0], 'channel'), AURORA);
  assertEquals(paramOf(stub.calls[0], 'ts'), '1788954450.000200');
  assertEquals(doc.mimeType, 'text/plain');
  assertEquals(doc.updatedAt, '2026-09-09T11:47:30.000Z');
  assertEquals(doc.text.split('\n\n').length, 3);
  assert(doc.text.startsWith('Reindex runbook is written up at last.'));
  assert(doc.text.endsWith('Fixed, it says ingest-primary now.'));
});

Deno.test('a malformed external id is refused without asking for a reconnect', async () => {
  const stub = stubSource([]);

  for (const id of ['', 'C0KB1AURORA', ':1788954450.000200', 'C0KB1AURORA:']) {
    try {
      await slackDriver.fetchDocument(creds([AURORA]), stub, id);
      throw new Error(`${id} did not raise`);
    } catch (err) {
      assert(err instanceof SourceError);
      assertEquals(err.needsReconnect, false);
    }
  }
  assertEquals(stub.calls.length, 0);
});

Deno.test('a 200 carrying ok false for a revoked token asks for a reconnect', async () => {
  const stub = stubSource([
    { when: () => true, status: 200, body: await loadFixture('slack', 'error_token_revoked') },
  ]);

  try {
    await slackDriver.listChanges(creds([AURORA]), stub, { cursor: null });
    throw new Error('did not raise');
  } catch (err) {
    assert(err instanceof SourceError);
    assertEquals(err.needsReconnect, true);
    // Nothing the provider sent back reaches a message the user reads.
    assert(!err.message.includes('token_revoked'));
    assert(!err.message.includes('xoxp-fixture-token'));
  }
});

Deno.test('a 200 carrying ok false for anything else does not ask for a reconnect', async () => {
  const stub = stubSource([
    {
      when: () => true,
      status: 200,
      body: await loadFixture('slack', 'error_channel_not_found'),
    },
  ]);

  try {
    await slackDriver.listChanges(creds([AURORA]), stub, { cursor: null });
    throw new Error('did not raise');
  } catch (err) {
    assert(err instanceof SourceError);
    assertEquals(err.needsReconnect, false);
    assert(!err.message.includes('channel_not_found'));
  }
});

Deno.test('scope options follow the next cursor across pages', async () => {
  const page1 = await loadFixture('slack', 'channels_page_1');
  const page2 = await loadFixture('slack', 'channels_page_2');
  const stub = stubSource([
    { when: (call) => paramOf(call, 'cursor') !== null, body: page2 },
    { when: (call) => isMethod(call, 'conversations.list'), body: page1 },
  ]);

  const options = await slackDriver.listScopeOptions(creds([]), stub);

  assertEquals(stub.calls.length, 2);
  assertEquals(paramOf(stub.calls[0], 'types'), 'public_channel,private_channel');
  assertEquals(paramOf(stub.calls[0], 'exclude_archived'), 'true');
  assertEquals(paramOf(stub.calls[1], 'cursor'), 'dGVhbTpDMEtCM0NJTkRFUg==');
  assertEquals(options, [
    { id: AURORA, name: '#knowledge-base' },
    { id: BEACON, name: '#docs-guild' },
    { id: 'C0KB3CINDER', name: '#architecture-notes' },
  ]);
});

Deno.test('refresh answers not supported without reaching slack', async () => {
  const stub = stubSource([]);

  const outcome = await slackDriver.refresh(stub, REFRESH_INPUT);

  assertEquals(outcome.kind, 'not_supported');
  assertEquals(stub.calls.length, 0);
});

Deno.test('the driver declares the channel scope picker', () => {
  assertEquals(slackDriver.provider, 'slack');
  assertEquals(slackDriver.scopeSelectionKind, 'channel');
});
