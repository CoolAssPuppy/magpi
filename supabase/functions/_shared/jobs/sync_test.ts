import { assert, assertEquals } from '@std/assert';

import type { ConnectionRow } from '../connections.ts';
import { encryptProviderToken } from '../provider_tokens.ts';
import { envSource } from '../testing/assertions.ts';
import { type StubDb, stubDb, type StubRequest } from '../testing/stub_db.ts';
import { runSyncJob } from './sync.ts';
import { fakeModel, fakeUploads, steppingClock } from './testing.ts';
import type { JobDeps } from './types.ts';

const NOW = new Date('2026-09-09T12:00:00.000Z');
const ORG = '44444444-4444-4444-8444-444444444444';
const SPACE = '33333333-3333-4333-8333-333333333333';
const USER = '11111111-1111-4111-8111-111111111111';

const ENV = envSource({
  SB_TOKEN_ENC_KEY: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
  SB_TOKEN_ENC_KEY_ID: '1',
  SB_LINEAR_CLIENT_ID: 'linear-client',
  SB_LINEAR_CLIENT_SECRET: 'linear-secret',
});

async function connection(overrides: Partial<ConnectionRow> = {}): Promise<ConnectionRow> {
  const provider = overrides.provider ?? 'linear';
  return {
    id: 'connection-1',
    org_id: ORG,
    space_id: SPACE,
    user_id: USER,
    provider,
    external_account_id: 'account-1',
    access_token_enc: await encryptProviderToken('lin_oauth', { userId: USER, provider }, ENV),
    refresh_token_enc: null,
    scopes: [],
    scope_selection: { ids: [] },
    status: 'active',
    status_detail: null,
    cursor: null,
    token_expires_at: null,
    last_synced_at: null,
    ...overrides,
  };
}

function issuesPage(
  nodes: { id: string; identifier: string; title: string; updatedAt: string }[],
  next: string | null = null,
) {
  return {
    data: {
      issues: {
        nodes: nodes.map((node) => ({ ...node, url: `https://linear.app/${node.identifier}` })),
        pageInfo: { hasNextPage: next !== null, endCursor: next },
      },
    },
  };
}

function issue(index: number) {
  return {
    id: `issue-${index}`,
    identifier: `ENG-${index}`,
    title: `Issue ${index}`,
    updatedAt: `2026-09-09T09:0${index}:00.000Z`,
  };
}

/** Every cursor this run wrote onto the connection, in the order it wrote them. */
function cursorsWritten(stub: StubDb): unknown[] {
  return patches(stub, 'connections')
    .map((patch) => patch.cursor)
    .filter((cursor) => cursor !== undefined);
}

function rowsInserted(stub: StubDb, table: string): Record<string, unknown>[] {
  return stub.requests
    .filter((request) => request.table === table && request.method === 'POST')
    .flatMap((request) => (Array.isArray(request.body) ? request.body : [request.body]))
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}

function patches(stub: StubDb, table: string): Record<string, unknown>[] {
  return stub.requests
    .filter((request) => request.table === table && request.method === 'PATCH')
    .map((request) => request.body as Record<string, unknown>);
}

interface Harness {
  stub: StubDb;
  deps: JobDeps;
}

function harness(options: {
  page?: unknown;
  /** One body per provider request, the last repeating once the list runs out. */
  pages?: unknown[];
  status?: number;
  reply?: (request: StubRequest) => { body?: unknown; status?: number } | undefined;
  clock?: { now(): Date };
  budgetMs?: number;
}): Harness {
  const stub = stubDb((request) => {
    const custom = options.reply?.(request);
    if (custom) return custom;
    // A fresh insert answers with the rows it created, which is how the caller
    // learns their ids.
    if (request.table === 'documents' && request.method === 'POST') {
      const body = Array.isArray(request.body) ? request.body : [request.body];
      return {
        body: body.map((row, index) => ({
          id: `document-${index + 1}`,
          external_id: (row as { external_id: string }).external_id,
        })),
      };
    }
    return { body: [] };
  });

  let request = 0;
  const bodyFor = (): unknown => {
    const sequence = options.pages;
    if (!sequence) return options.page ?? issuesPage([]);
    return sequence[Math.min(request++, sequence.length - 1)];
  };

  return {
    stub,
    deps: {
      db: stub.db,
      http: {
        now: options.clock?.now ?? (() => NOW),
        fetch: () =>
          Promise.resolve(
            new Response(JSON.stringify(bodyFor()), {
              status: options.status ?? 200,
              headers: { 'content-type': 'application/json' },
            }),
          ),
      },
      models: fakeModel(),
      uploads: fakeUploads({}),
      env: ENV,
      budgetMs: options.budgetMs,
    },
  };
}

Deno.test('a changed document is filed and an ingest job is queued for it', async () => {
  const h = harness({
    page: issuesPage([
      {
        id: 'issue-1',
        identifier: 'ENG-1',
        title: 'SSO rollout',
        updatedAt: '2026-09-09T09:00:00.000Z',
      },
    ]),
  });
  try {
    const result = await runSyncJob(await connection(), h.deps);

    assertEquals(result.kind, 'synced');
    if (result.kind !== 'synced') return;
    assertEquals(result.documentCount, 1);
    assertEquals(result.enqueued, 1);

    const documents = rowsInserted(h.stub, 'documents');
    assertEquals(documents[0].space_id, SPACE);
    assertEquals(documents[0].org_id, ORG);
    assertEquals(documents[0].origin, 'sync');
    assertEquals(documents[0].external_id, 'issue-1');

    const jobs = rowsInserted(h.stub, 'ingest_jobs');
    assertEquals(jobs[0].document_id, 'document-1');
    assertEquals(jobs[0].status, 'queued');
    assertEquals(jobs[0].space_id, SPACE);
  } finally {
    await h.stub.close();
  }
});

Deno.test('sync never reads document text itself', async () => {
  // One enormous document must not take the whole pass down with it.
  const h = harness({
    page: issuesPage([
      { id: 'issue-1', identifier: 'ENG-1', title: 'A', updatedAt: '2026-09-09T09:00:00.000Z' },
    ]),
  });
  try {
    await runSyncJob(await connection(), h.deps);
    assertEquals(rowsInserted(h.stub, 'chunks').length, 0);
    assertEquals((h.deps.models as ReturnType<typeof fakeModel>).embedCalls.length, 0);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a document already filed is relabelled rather than duplicated', async () => {
  const h = harness({
    page: issuesPage([
      {
        id: 'issue-1',
        identifier: 'ENG-1',
        title: 'Renamed',
        updatedAt: '2026-09-09T09:00:00.000Z',
      },
    ]),
    reply: (request) =>
      request.table === 'documents' && request.method === 'GET'
        ? { body: [{ id: 'document-existing', external_id: 'issue-1' }] }
        : undefined,
  });
  try {
    await runSyncJob(await connection(), h.deps);

    assertEquals(rowsInserted(h.stub, 'documents').length, 0);
    assertEquals(patches(h.stub, 'documents')[0].title, 'ENG-1 Renamed');
    assertEquals(rowsInserted(h.stub, 'ingest_jobs')[0].document_id, 'document-existing');
  } finally {
    await h.stub.close();
  }
});

Deno.test('the cursor advances only after the jobs exist', async () => {
  const h = harness({
    page: issuesPage([
      { id: 'issue-1', identifier: 'ENG-1', title: 'A', updatedAt: '2026-09-09T09:00:00.000Z' },
    ]),
  });
  try {
    await runSyncJob(await connection(), h.deps);

    const order = h.stub.requests
      .filter((request) => request.table === 'ingest_jobs' || request.table === 'connections')
      .map((request) => `${request.table}:${request.method}`);
    // The last connections PATCH is the cursor, and it comes after the queue.
    assertEquals(order.at(-1), 'connections:PATCH');
    assert(order.includes('ingest_jobs:POST'));
    assert(order.indexOf('ingest_jobs:POST') < order.lastIndexOf('connections:PATCH'));

    const cursorPatch = patches(h.stub, 'connections').at(-1);
    assertEquals(cursorPatch?.cursor, '2026-09-09T09:00:00.000Z');
    assertEquals(cursorPatch?.last_synced_at, NOW.toISOString());
    assertEquals(cursorPatch?.status, 'active');
  } finally {
    await h.stub.close();
  }
});

Deno.test('a pass with nothing new still advances last_synced_at', async () => {
  const h = harness({ page: issuesPage([]) });
  try {
    const result = await runSyncJob(
      await connection({ cursor: '2026-09-01T00:00:00.000Z' }),
      h.deps,
    );
    assertEquals(result.kind, 'synced');
    if (result.kind !== 'synced') return;
    assertEquals(result.documentCount, 0);
    assertEquals(patches(h.stub, 'connections').at(-1)?.last_synced_at, NOW.toISOString());
  } finally {
    await h.stub.close();
  }
});

Deno.test('a connection marked syncing while it runs settles back to active', async () => {
  const h = harness({ page: issuesPage([]) });
  try {
    await runSyncJob(await connection(), h.deps);
    const statuses = patches(h.stub, 'connections').map((row) => row.status);
    assertEquals(statuses, ['syncing', 'active']);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a refused credential expires the connection with a reason', async () => {
  const h = harness({ page: { errors: [{ extensions: { code: 'AUTHENTICATION_ERROR' } }] } });
  try {
    const result = await runSyncJob(await connection(), h.deps);

    assertEquals(result.kind, 'failed');
    const last = patches(h.stub, 'connections').at(-1);
    assertEquals(last?.status, 'expired');
    assert(String(last?.status_detail).length > 0);
    // Nothing was filed, so the next pass starts where this one did.
    assertEquals(rowsInserted(h.stub, 'documents').length, 0);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a provider having a bad minute is an error, not an expiry', async () => {
  const h = harness({ page: {}, status: 500 });
  try {
    const result = await runSyncJob(await connection(), h.deps);
    assertEquals(result.kind, 'failed');
    assertEquals(patches(h.stub, 'connections').at(-1)?.status, 'error');
  } finally {
    await h.stub.close();
  }
});

Deno.test('a connection whose token cannot be renewed is skipped, not retried', async () => {
  const h = harness({
    page: issuesPage([]),
    reply: (request) =>
      request.table === 'providers'
        ? {
          body: [{
            slug: 'linear',
            display_name: 'Linear',
            description: '',
            kind: 'oauth',
            auth_url: 'https://linear.example/authorize',
            token_url: 'https://linear.example/token',
            scopes: [],
            docs_url: null,
            enabled: true,
            position: 0,
            scope_selection_kind: null,
          }],
        }
        : undefined,
  });
  try {
    const result = await runSyncJob(
      await connection({
        token_expires_at: '2026-09-09T12:00:10.000Z',
        refresh_token_enc: null,
      }),
      h.deps,
    );

    assertEquals(result.kind, 'expired');
    assertEquals(rowsInserted(h.stub, 'ingest_jobs').length, 0);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a pass that runs out of time leaves the cursor where it was', async () => {
  const h = harness({ clock: steppingClock(NOW, 60_000), budgetMs: 1000, page: issuesPage([]) });
  try {
    const result = await runSyncJob(await connection({ cursor: 'keep-me' }), h.deps);

    assertEquals(result.kind, 'timeout');
    for (const patch of patches(h.stub, 'connections')) {
      assertEquals(patch.cursor, undefined, 'a timed out pass moved the cursor');
    }
  } finally {
    await h.stub.close();
  }
});

Deno.test('a backlog the driver could not finish in one call is walked in the same run', async () => {
  // Five requests is the Linear driver's own ceiling for one listChanges, so the
  // sixth page is reached only if the job asks it for another pass.
  const pages: unknown[] = [1, 2, 3, 4, 5].map((n) => issuesPage([issue(n)], `page-${n + 1}`));
  pages.push(issuesPage([issue(6)]));

  const h = harness({ pages });
  try {
    const result = await runSyncJob(await connection(), h.deps);

    assertEquals(result.kind, 'synced');
    if (result.kind !== 'synced') return;
    assertEquals(result.documentCount, 6);
    assertEquals(result.hasMore, false);
    assertEquals(rowsInserted(h.stub, 'ingest_jobs').length, 6);

    const cursors = cursorsWritten(h.stub);
    assertEquals(cursors.length, 2);
    assert(
      String(cursors[0]).includes('"page":"page-6"'),
      'the first pass did not record where it stopped',
    );
    // The backlog is spent, so the connection is back to a plain watermark.
    assertEquals(cursors[1], '2026-09-09T09:06:00.000Z');
  } finally {
    await h.stub.close();
  }
});

Deno.test('a walk that runs out of time keeps what it filed and says there is more', async () => {
  const h = harness({
    page: issuesPage([issue(1)], 'page-2'),
    clock: steppingClock(NOW, 500),
    budgetMs: 20_000,
  });
  try {
    const result = await runSyncJob(await connection(), h.deps);

    // A connection with a backlog is behind, not broken. Reporting a timeout
    // would put an error on a row that made real progress.
    assertEquals(result.kind, 'synced');
    if (result.kind !== 'synced') return;
    assert(result.hasMore, 'a run that stopped early said there was nothing left');

    const cursors = cursorsWritten(h.stub);
    assert(cursors.length > 1, 'the run stopped after one page');
    assert(
      String(cursors.at(-1)).includes('"kind":"backlog"'),
      'the next run has nowhere to resume from',
    );
    assertEquals(patches(h.stub, 'connections').at(-1)?.status, 'active');
  } finally {
    await h.stub.close();
  }
});

Deno.test('a driver that reports more without moving its cursor is asked once more', async () => {
  // Slack reads a fixed number of channels per pass and reports the rest as
  // more. Channels with nothing in them leave the cursor exactly as it was, so
  // asking again in this run would read the same channels until the budget went.
  const channels = Array.from({ length: 21 }, (_, index) => `C${index}`);
  const h = harness({ page: { ok: true, messages: [] } });
  try {
    const result = await runSyncJob(
      await connection({
        provider: 'slack',
        scope_selection: {
          kind: 'channel',
          available: channels.map((id) => ({ id, name: id })),
          selected: channels,
        },
      }),
      h.deps,
    );

    assertEquals(result.kind, 'synced');
    if (result.kind !== 'synced') return;
    assertEquals(result.hasMore, true);
    assertEquals(cursorsWritten(h.stub).length, 2);
  } finally {
    await h.stub.close();
  }
});
