import { assert, assertEquals } from '@std/assert';

import { EMBEDDING_DIMENSIONS } from '../models.ts';
import { encryptProviderToken } from '../provider_tokens.ts';
import { envSource } from '../testing/assertions.ts';
import { type StubDb, stubDb, type StubRequest } from '../testing/stub_db.ts';
import { type IngestJobRecord, runIngestJob } from './ingest.ts';
import { fakeModel, fakeUploads, steppingClock } from './testing.ts';
import type { JobDeps } from './types.ts';

const NOW = new Date('2026-09-09T12:00:00.000Z');
const ORG = '44444444-4444-4444-8444-444444444444';
const SPACE = '33333333-3333-4333-8333-333333333333';
const USER = '11111111-1111-4111-8111-111111111111';

const ENV = envSource({
  SB_TOKEN_ENC_KEY: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
  SB_TOKEN_ENC_KEY_ID: '1',
  SB_NOTION_CLIENT_ID: 'notion-client',
  SB_NOTION_CLIENT_SECRET: 'notion-secret',
});

const JOB: IngestJobRecord = {
  id: 'job-1',
  org_id: ORG,
  space_id: SPACE,
  document_id: 'document-1',
  connection_id: null,
};

function uploadDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: 'document-1',
    org_id: ORG,
    space_id: SPACE,
    connection_id: null,
    external_id: null,
    title: 'Runbook',
    url: null,
    mime_type: 'text/markdown',
    storage_path: 'uploads/runbook.md',
    content_hash: null,
    version: 1,
    size_bytes: null,
    ...overrides,
  };
}

function writes(stub: StubDb, table: string, method = 'PATCH'): Record<string, unknown>[] {
  return stub.requests
    .filter((request) => request.table === table && request.method === method)
    .map((request) => request.body as Record<string, unknown>);
}

function rowsInserted(stub: StubDb, table: string): Record<string, unknown>[] {
  return stub.requests
    .filter((request) => request.table === table && request.method === 'POST')
    .flatMap((request) => (Array.isArray(request.body) ? request.body : [request.body]))
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}

interface Harness {
  stub: StubDb;
  deps: JobDeps;
}

function harness(options: {
  document?: Record<string, unknown>;
  files?: Record<string, string>;
  reply?: (request: StubRequest) => { body?: unknown; status?: number } | undefined;
  clock?: { now(): Date };
  budgetMs?: number;
  fetch?: typeof fetch;
}): Harness {
  const document = options.document ?? uploadDocument();
  const stub = stubDb((request) => {
    const custom = options.reply?.(request);
    if (custom) return custom;
    if (request.table === 'documents' && request.method === 'GET') return { body: [document] };
    return { body: [] };
  });

  return {
    stub,
    deps: {
      db: stub.db,
      http: {
        now: options.clock?.now ?? (() => NOW),
        fetch: options.fetch ?? (() => Promise.reject(new Error('no network in this test'))),
      },
      models: fakeModel(),
      uploads: fakeUploads(options.files ?? { 'uploads/runbook.md': '# Runbook\n\nRestart it.' }),
      env: ENV,
      budgetMs: options.budgetMs,
    },
  };
}

Deno.test('an uploaded document is extracted, chunked, embedded and stored', async () => {
  const h = harness({});
  try {
    const result = await runIngestJob(JOB, h.deps);

    assertEquals(result.kind, 'succeeded');
    if (result.kind !== 'succeeded') return;
    assertEquals(result.chunkCount, 1);

    const chunks = rowsInserted(h.stub, 'chunks');
    assertEquals(chunks.length, 1);
    assertEquals(chunks[0].space_id, SPACE);
    assertEquals(chunks[0].org_id, ORG);
    assertEquals(chunks[0].document_id, 'document-1');
    assertEquals(chunks[0].ordinal, 0);
    assertEquals((chunks[0].embedding as number[]).length, EMBEDDING_DIMENSIONS);
  } finally {
    await h.stub.close();
  }
});

Deno.test('the job walks every stage so progress is visible while it runs', async () => {
  const h = harness({});
  try {
    await runIngestJob(JOB, h.deps);
    // No 'fetch' write: claim_ingest_jobs set the row running before the body
    // was handed the record, and the column already defaults to fetch.
    const stages = writes(h.stub, 'ingest_jobs').map((row) => row.stage);
    assertEquals(stages, ['extract', 'chunk', 'embed', 'store', 'store']);
    assertEquals(writes(h.stub, 'ingest_jobs').at(-1)?.status, 'succeeded');
  } finally {
    await h.stub.close();
  }
});

Deno.test('the job body does not rewrite the claim it was handed', async () => {
  // claimed_at is how long a job has been held. Rewriting it here would reset
  // that clock to the moment the body started.
  const h = harness({});
  try {
    await runIngestJob(JOB, h.deps);
    for (const write of writes(h.stub, 'ingest_jobs')) {
      assertEquals(write.claimed_at, undefined, 'the body overwrote the claim time');
      assertEquals(write.attempts, undefined, 'the body overwrote the attempt count');
    }
  } finally {
    await h.stub.close();
  }
});

Deno.test('the old chunks are cleared before the new ones land', async () => {
  // A second pass that appended would double every answer the document gives.
  const h = harness({});
  try {
    await runIngestJob(JOB, h.deps);
    const order = h.stub.requests
      .filter((request) => request.table === 'chunks')
      .map((request) => request.method);
    assertEquals(order, ['DELETE', 'POST']);
  } finally {
    await h.stub.close();
  }
});

Deno.test('text that has not changed is not embedded again', async () => {
  // sha256 of the fixture body, so the document arrives already up to date.
  const first = harness({});
  let hash = '';
  try {
    await runIngestJob(JOB, first.deps);
    hash = String(writes(first.stub, 'documents')[0].content_hash);
  } finally {
    await first.stub.close();
  }

  const h = harness({ document: uploadDocument({ content_hash: hash }) });
  try {
    const result = await runIngestJob(JOB, h.deps);
    assertEquals(result.kind, 'unchanged');
    assertEquals(rowsInserted(h.stub, 'chunks').length, 0);
    assertEquals((h.deps.models as ReturnType<typeof fakeModel>).embedCalls.length, 0);
    assertEquals(writes(h.stub, 'ingest_jobs').at(-1)?.status, 'succeeded');
  } finally {
    await h.stub.close();
  }
});

Deno.test('the document records its new hash and a bumped version', async () => {
  const h = harness({ document: uploadDocument({ version: 3 }) });
  try {
    await runIngestJob(JOB, h.deps);
    const update = writes(h.stub, 'documents')[0];
    assertEquals(update.version, 4);
    assert(typeof update.content_hash === 'string' && update.content_hash.length === 64);
  } finally {
    await h.stub.close();
  }
});

Deno.test('ingesting a document meters what the plan meters', async () => {
  const h = harness({});
  try {
    await runIngestJob(JOB, h.deps);
    const usage = rowsInserted(h.stub, 'usage_events');
    assertEquals(usage.map((row) => row.kind), [
      'document_ingested',
      'chunk_embedded',
      'storage_bytes',
    ]);
    assertEquals(usage[0].org_id, ORG);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a document with neither bytes nor a source is a legible failure', async () => {
  const h = harness({
    document: uploadDocument({ storage_path: null, connection_id: null, external_id: null }),
  });
  try {
    const result = await runIngestJob(JOB, h.deps);
    assertEquals(result.kind, 'failed');
    if (result.kind !== 'failed') return;
    assertEquals(result.stage, 'fetch');

    const final = writes(h.stub, 'ingest_jobs').at(-1);
    assertEquals(final?.status, 'failed');
    assertEquals(final?.error, result.detail);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a file type that cannot be read fails at extract, not at store', async () => {
  const h = harness({
    document: uploadDocument({ mime_type: 'image/png', storage_path: 'uploads/logo.png' }),
    files: { 'uploads/logo.png': 'binary' },
  });
  try {
    const result = await runIngestJob(JOB, h.deps);
    assertEquals(result.kind, 'failed');
    if (result.kind !== 'failed') return;
    assert(result.detail.includes('image/png'));
    assertEquals(rowsInserted(h.stub, 'chunks').length, 0);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a job that runs out of time says which stage it died in', async () => {
  // The clock jumps a full budget on its second read, so the first checkpoint
  // after the fetch is already over.
  const h = harness({ clock: steppingClock(NOW, 60_000), budgetMs: 1000 });
  try {
    const result = await runIngestJob(JOB, h.deps);

    assertEquals(result.kind, 'timeout');
    if (result.kind !== 'timeout') return;
    assertEquals(result.stage, 'extract');

    const final = writes(h.stub, 'ingest_jobs').at(-1);
    assertEquals(final?.status, 'timeout');
    // The stage lives in its own column, so the message says what the column
    // cannot: how long it ran and what the budget was.
    assertEquals(final?.stage, 'extract');
    assert(!String(final?.error).includes('extract'), 'the message repeats the stage column');
    assert(String(final?.error).includes('budget'), String(final?.error));
  } finally {
    await h.stub.close();
  }
});

Deno.test('a timed out job stores no chunks', async () => {
  const h = harness({ clock: steppingClock(NOW, 60_000), budgetMs: 1000 });
  try {
    await runIngestJob(JOB, h.deps);
    assertEquals(rowsInserted(h.stub, 'chunks').length, 0);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a document from a source is fetched through its connection', async () => {
  const provider = 'notion';
  const connectionRow = {
    id: 'connection-1',
    org_id: ORG,
    space_id: SPACE,
    user_id: USER,
    provider,
    external_account_id: 'workspace-1',
    access_token_enc: await encryptProviderToken('ntn_token', { userId: USER, provider }, ENV),
    refresh_token_enc: null,
    scopes: [],
    scope_selection: { ids: [] },
    status: 'active',
    status_detail: null,
    cursor: null,
    token_expires_at: null,
    last_synced_at: null,
  };

  const h = harness({
    document: uploadDocument({
      storage_path: null,
      connection_id: 'connection-1',
      external_id: 'page-1',
      mime_type: null,
    }),
    reply: (request) => {
      if (request.table === 'connections' && request.method === 'GET') {
        return { body: [connectionRow] };
      }
      return undefined;
    },
    fetch: (input: string | URL | Request) => {
      const url = String(input);
      const body = url.includes('/blocks/')
        ? {
          results: [
            { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Ship on Tuesday.' }] } },
          ],
          has_more: false,
        }
        : {
          object: 'page',
          id: 'page-1',
          url: 'https://notion.so/page-1',
          last_edited_time: '2026-09-08T00:00:00.000Z',
          properties: { Name: { type: 'title', title: [{ plain_text: 'Launch plan' }] } },
        };
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    },
  });

  try {
    const result = await runIngestJob(
      { ...JOB, connection_id: 'connection-1' },
      h.deps,
    );

    assertEquals(result.kind, 'succeeded');
    const chunks = rowsInserted(h.stub, 'chunks');
    assertEquals(chunks.length, 1);
    assert(String(chunks[0].content).includes('Ship on Tuesday.'));
    // The title and url come from the provider, not from the placeholder row.
    assertEquals(writes(h.stub, 'documents')[0].title, 'Launch plan');
  } finally {
    await h.stub.close();
  }
});

Deno.test('a document whose connection was removed fails without a stack trace', async () => {
  const h = harness({
    document: uploadDocument({
      storage_path: null,
      connection_id: 'connection-gone',
      external_id: 'page-1',
    }),
  });
  try {
    const result = await runIngestJob({ ...JOB, connection_id: 'connection-gone' }, h.deps);
    assertEquals(result.kind, 'failed');
    if (result.kind !== 'failed') return;
    assert(result.detail.includes('connection'));
  } finally {
    await h.stub.close();
  }
});

Deno.test('an uploaded document records what it weighs and meters the storage', async () => {
  const h = harness({});
  try {
    await runIngestJob(JOB, h.deps);
    const size = new TextEncoder().encode('# Runbook\n\nRestart it.').byteLength;

    assertEquals(writes(h.stub, 'documents')[0].size_bytes, size);
    const usage = rowsInserted(h.stub, 'usage_events');
    assertEquals(usage.map((row) => row.kind), [
      'document_ingested',
      'chunk_embedded',
      'storage_bytes',
    ]);
    assertEquals(usage[2].quantity, size);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a re-import meters only what the file grew by', async () => {
  // The admin page sums these events, so charging the whole file twice would
  // report storage nobody is using.
  const h = harness({
    document: uploadDocument({ size_bytes: 10 }),
    files: { 'uploads/runbook.md': '# Runbook\n\nRestart it, twice.' },
  });
  try {
    await runIngestJob(JOB, h.deps);
    const size = new TextEncoder().encode('# Runbook\n\nRestart it, twice.').byteLength;
    assertEquals(rowsInserted(h.stub, 'usage_events')[2].quantity, size - 10);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a synced document weighs its text and meters no storage', async () => {
  // Nothing from a source occupies a bucket, so metering it would report storage
  // the organization is not using.
  const provider = 'notion';
  const connectionRow = {
    id: 'connection-1',
    org_id: ORG,
    space_id: SPACE,
    user_id: USER,
    provider,
    external_account_id: 'workspace-1',
    access_token_enc: await encryptProviderToken('ntn_token', { userId: USER, provider }, ENV),
    refresh_token_enc: null,
    scopes: [],
    scope_selection: { ids: [] },
    status: 'active',
    status_detail: null,
    cursor: null,
    token_expires_at: null,
    last_synced_at: null,
  };

  const h = harness({
    document: uploadDocument({
      storage_path: null,
      connection_id: 'connection-1',
      external_id: 'page-1',
      mime_type: null,
    }),
    reply: (request) =>
      request.table === 'connections' && request.method === 'GET'
        ? { body: [connectionRow] }
        : undefined,
    fetch: (input: string | URL | Request) => {
      const body = String(input).includes('/blocks/')
        ? {
          results: [
            { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Ship on Tuesday.' }] } },
          ],
          has_more: false,
        }
        : {
          object: 'page',
          id: 'page-1',
          url: 'https://notion.so/page-1',
          last_edited_time: '2026-09-08T00:00:00.000Z',
          properties: { Name: { type: 'title', title: [{ plain_text: 'Launch plan' }] } },
        };
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    },
  });

  try {
    await runIngestJob({ ...JOB, connection_id: 'connection-1' }, h.deps);
    assertEquals(writes(h.stub, 'documents')[0].size_bytes, 'Ship on Tuesday.'.length);
    assertEquals(
      rowsInserted(h.stub, 'usage_events').map((row) => row.kind),
      ['document_ingested', 'chunk_embedded'],
    );
  } finally {
    await h.stub.close();
  }
});
