import { assert, assertEquals, assertStringIncludes } from '@std/assert';

import type { CompleteInput, ModelRunner } from '../model_client.ts';
import {
  requestsFor,
  type StubDb,
  stubDb,
  type StubReply,
  type StubRequest,
} from '../testing/stub_db.ts';
import { type DreamRunRecord, runDreamJob } from './dream.ts';
import type { JobDeps } from './types.ts';

const ORG = '44444444-4444-4444-8444-444444444444';
const SPACE = '33333333-3333-4333-8333-333333333333';
const FOREIGN_SPACE = '99999999-9999-4999-8999-999999999999';
const RUN = '55555555-5555-4555-8555-555555555555';
const DOC_A = '11111111-1111-4111-8111-111111111111';
const DOC_B = '22222222-2222-4222-8222-222222222222';
const FOREIGN_DOC = '88888888-8888-4888-8888-888888888888';
const CHUNK_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CHUNK_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FOREIGN_CHUNK = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DREAM_DOC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const NOW = new Date('2026-09-09T12:00:00.000Z');

function dreamRun(kind: DreamRunRecord['kind']): DreamRunRecord {
  return { id: RUN, org_id: ORG, space_id: SPACE, kind };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fakeModels(complete: (input: CompleteInput) => string): ModelRunner {
  return {
    embed: ({ texts }) => Promise.resolve(texts.map((_text, index) => [index, 0.5])),
    complete: (input) => Promise.resolve(complete(input)),
  };
}

function jobDeps(stub: StubDb, models: ModelRunner, budgetMs?: number): JobDeps {
  return {
    db: stub.db,
    http: {
      fetch: () => Promise.reject(new Error('a dream job makes no direct http call')),
      now: () => new Date(NOW.getTime()),
    },
    models,
    uploads: { read: () => Promise.reject(new Error('a dream job reads no uploads')) },
    budgetMs,
  };
}

/** The rows a read answers with. `foreign` adds a row a leak has something to leak. */
function chunkRows(foreign: boolean): unknown[] {
  const rows: unknown[] = [
    {
      id: CHUNK_A,
      document_id: DOC_A,
      ordinal: 0,
      content: 'Ada agreed to ship the billing page on Friday.',
      created_at: '2026-09-09T09:00:00.000Z',
      space_id: SPACE,
    },
    {
      id: CHUNK_B,
      document_id: DOC_B,
      ordinal: 0,
      content: 'Northwind asked about SSO again.',
      created_at: '2026-09-09T10:00:00.000Z',
      space_id: SPACE,
    },
  ];
  if (!foreign) return rows;
  return [...rows, {
    id: FOREIGN_CHUNK,
    document_id: FOREIGN_DOC,
    ordinal: 0,
    content: 'A row from a space this run may not touch.',
    created_at: '2026-09-09T11:00:00.000Z',
    space_id: FOREIGN_SPACE,
  }];
}

function documentRows(overrides: { connectionB?: string | null } = {}): unknown[] {
  return [
    {
      id: DOC_A,
      title: 'Notes from Monday',
      origin: 'sync',
      connection_id: 'conn-1',
      url: null,
      updated_at: '2026-09-09T09:00:00.000Z',
      space_id: SPACE,
    },
    {
      id: DOC_B,
      title: 'Northwind renewal',
      origin: 'upload',
      connection_id: overrides.connectionB === undefined ? null : overrides.connectionB,
      url: null,
      updated_at: '2026-09-09T10:00:00.000Z',
      space_id: SPACE,
    },
  ];
}

function searchHits(foreign: boolean): unknown[] {
  const hits: unknown[] = [
    { chunk_id: CHUNK_A, document_id: DOC_A, space_id: SPACE, content: 'self', score: 0.03 },
    { chunk_id: CHUNK_B, document_id: DOC_B, space_id: SPACE, content: 'other', score: 0.02 },
  ];
  if (!foreign) return hits;
  return [...hits, {
    chunk_id: FOREIGN_CHUNK,
    document_id: FOREIGN_DOC,
    space_id: FOREIGN_SPACE,
    content: 'foreign',
    score: 0.01,
  }];
}

/** One reply function that answers every read all three kinds make. */
function replies(
  overrides: { chunks?: unknown[]; foreign?: boolean; connectionB?: string | null } = {},
): (request: StubRequest) => StubReply | undefined {
  return (request) => {
    if (request.table === 'chunks' && request.method === 'GET') {
      if (request.query.includes('document_id=eq.')) {
        return { body: { id: CHUNK_A, content: 'Ada agreed to ship the billing page.' } };
      }
      return { body: overrides.chunks ?? chunkRows(overrides.foreign === true) };
    }
    if (request.table === 'documents' && request.method === 'GET') {
      const rows = documentRows({ connectionB: overrides.connectionB });
      return { body: request.query.includes('origin=neq.dream') ? rows.slice(0, 1) : rows };
    }
    if (request.table === 'documents' && request.method === 'POST') {
      return { body: { id: DREAM_DOC } };
    }
    if (request.table === 'entities') {
      return { body: { id: 'ee000000-0000-4000-8000-000000000001' } };
    }
    if (request.table === 'rpc/search') return { body: searchHits(overrides.foreign === true) };
    return undefined;
  };
}

function entityAnswer(chunkIds: string[]): string {
  return JSON.stringify([
    {
      kind: 'person',
      name: 'Ada',
      canonicalName: 'ada',
      summary: 'Owns the billing page.',
      chunkIds,
    },
  ]);
}

const RATIONALE_ANSWER = JSON.stringify([{
  pair: 0,
  rationale: 'Both cover the Northwind renewal.',
}]);

function answerFor(input: CompleteInput): string {
  if (input.user.includes('CANDIDATE PAIRS')) return RATIONALE_ANSWER;
  if (input.system.includes('entities')) return entityAnswer([CHUNK_A, CHUNK_B]);
  return 'What changed: the billing page shipped.';
}

function writtenBodies(stub: StubDb, table: string): unknown[] {
  return requestsFor(stub, table).filter((request) => request.method !== 'GET').map((r) => r.body);
}

function runUpdates(stub: StubDb): Record<string, unknown>[] {
  return requestsFor(stub, 'dream_runs')
    .filter((request) => request.method === 'PATCH')
    .flatMap((request) => (isRecord(request.body) ? [request.body] : []));
}

/** Every value written under a space_id or space_filter key, however deep. */
function spaceIdsIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(spaceIdsIn);
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, inner]) => {
    if (key !== 'space_id' && key !== 'space_filter') return spaceIdsIn(inner);
    const values = Array.isArray(inner) ? inner : [inner];
    return values.filter((entry): entry is string => typeof entry === 'string');
  });
}

Deno.test('a dream run writes nothing carrying another space', async () => {
  const stub = stubDb(replies({ foreign: true }));
  try {
    for (const kind of ['entities', 'digest', 'connections'] as const) {
      const result = await runDreamJob(dreamRun(kind), jobDeps(stub, fakeModels(answerFor)));
      assertEquals(result.kind, 'succeeded');
    }

    const writes = stub.requests.filter((request) => request.method !== 'GET');
    // Not vacuous: an implementation that writes nothing must not pass.
    for (const table of ['entities', 'entity_mentions', 'documents', 'chunks', 'dream_links']) {
      assert(
        writes.some((request) => request.table === table),
        `expected the pass to write ${table}`,
      );
    }

    for (const request of writes) {
      for (const spaceId of spaceIdsIn(request.body)) {
        assertEquals(spaceId, SPACE, `${request.table} named a space this run does not own`);
      }
      assert(
        !JSON.stringify(request.body ?? null).includes(FOREIGN_SPACE),
        `${request.table} carried a foreign space id`,
      );
    }
  } finally {
    await stub.close();
  }
});

Deno.test('the run row goes to running and then succeeded', async () => {
  const stub = stubDb(replies());
  try {
    const result = await runDreamJob(dreamRun('digest'), jobDeps(stub, fakeModels(answerFor)));

    assert(result.kind === 'succeeded');
    assertEquals(result.inputDocumentCount, 2);
    assertEquals(result.outputDocumentId, DREAM_DOC);

    const updates = runUpdates(stub);
    assertEquals(updates.length, 2);
    assertEquals(updates[0].status, 'running');
    assertEquals(updates[0].started_at, NOW.toISOString());
    assertEquals(updates[1].status, 'succeeded');
    assertEquals(updates[1].finished_at, NOW.toISOString());
    assertEquals(updates[1].input_document_count, 2);
    assertEquals(updates[1].output_document_id, DREAM_DOC);
    assertEquals(updates[1].error, null);
    assertEquals(writtenBodies(stub, 'usage_events').length, 1);
  } finally {
    await stub.close();
  }
});

Deno.test('entities upserts what the model found and mentions the chunks it came from', async () => {
  const stub = stubDb(replies());
  try {
    const result = await runDreamJob(dreamRun('entities'), jobDeps(stub, fakeModels(answerFor)));

    assert(result.kind === 'succeeded');
    assertEquals(result.produced, 1);
    assertEquals(result.outputDocumentId, null);

    const entities = writtenBodies(stub, 'entities');
    assertEquals(entities.length, 1);
    assert(isRecord(entities[0]));
    assertEquals(entities[0].kind, 'person');
    assertEquals(entities[0].canonical_name, 'ada');
    assertEquals(entities[0].org_id, ORG);

    const mentions = writtenBodies(stub, 'entity_mentions');
    assertEquals(mentions.length, 1);
    assert(Array.isArray(mentions[0]));
    assertEquals(mentions[0].length, 2);
    assert(isRecord(mentions[0][0]));
    assertEquals(mentions[0][0].chunk_id, CHUNK_A);
    assertEquals(mentions[0][0].document_id, DOC_A);
  } finally {
    await stub.close();
  }
});

Deno.test('a model answer that is not JSON fails the run and writes no entities', async () => {
  const stub = stubDb(replies());
  try {
    const result = await runDreamJob(
      dreamRun('entities'),
      jobDeps(stub, fakeModels(() => 'Sure! Here are the entities I found: Ada, Northwind.')),
    );

    assert(result.kind === 'failed');
    assert(result.detail.length > 0);
    assertEquals(writtenBodies(stub, 'entities').length, 0);
    assertEquals(writtenBodies(stub, 'entity_mentions').length, 0);

    const updates = runUpdates(stub);
    assertEquals(updates[1].status, 'failed');
    assertEquals(updates[1].error, result.detail);
    assertEquals(updates[1].finished_at, NOW.toISOString());
  } finally {
    await stub.close();
  }
});

Deno.test('a JSON answer wrapped in a markdown code fence still parses', async () => {
  const stub = stubDb(replies());
  try {
    const fenced = '```json\n' + entityAnswer([CHUNK_A]) + '\n```';
    const result = await runDreamJob(dreamRun('entities'), jobDeps(stub, fakeModels(() => fenced)));

    assert(result.kind === 'succeeded');
    assertEquals(result.produced, 1);
    assertEquals(writtenBodies(stub, 'entities').length, 1);
  } finally {
    await stub.close();
  }
});

Deno.test('a mention naming a chunk the model was never given is dropped', async () => {
  const stub = stubDb(replies());
  try {
    const invented = entityAnswer([CHUNK_A, FOREIGN_CHUNK, 'not-a-chunk-we-sent']);
    const result = await runDreamJob(
      dreamRun('entities'),
      jobDeps(stub, fakeModels(() => invented)),
    );

    assert(result.kind === 'succeeded');
    const mentions = writtenBodies(stub, 'entity_mentions');
    assert(Array.isArray(mentions[0]));
    assertEquals(mentions[0].length, 1);
    assert(isRecord(mentions[0][0]));
    assertEquals(mentions[0][0].chunk_id, CHUNK_A);
  } finally {
    await stub.close();
  }
});

Deno.test('a digest is written as a cited document, chunked and embedded', async () => {
  const stub = stubDb(replies());
  try {
    const result = await runDreamJob(dreamRun('digest'), jobDeps(stub, fakeModels(answerFor)));

    assert(result.kind === 'succeeded');
    assertEquals(result.outputDocumentId, DREAM_DOC);

    const documents = writtenBodies(stub, 'documents');
    assertEquals(documents.length, 1);
    assert(isRecord(documents[0]));
    assertEquals(documents[0].origin, 'dream');
    assertEquals(documents[0].dream_run_id, RUN);
    assertEquals(documents[0].space_id, SPACE);

    const chunks = writtenBodies(stub, 'chunks');
    assertEquals(chunks.length, 1);
    assert(Array.isArray(chunks[0]));
    const text = chunks[0]
      .flatMap((
        chunk,
      ) => (isRecord(chunk) && typeof chunk.content === 'string' ? [chunk.content] : []))
      .join('\n');
    assertStringIncludes(text, '## Sources');
    assertStringIncludes(text, 'Notes from Monday');
    assertStringIncludes(text, CHUNK_A);
    assertStringIncludes(text, CHUNK_B);
    assert(isRecord(chunks[0][0]));
    assert(Array.isArray(chunks[0][0].embedding));
  } finally {
    await stub.close();
  }
});

Deno.test('connections scopes the search to its own space and skips same-source hits', async () => {
  const stub = stubDb(replies());
  try {
    const result = await runDreamJob(dreamRun('connections'), jobDeps(stub, fakeModels(answerFor)));

    assert(result.kind === 'succeeded');
    assertEquals(result.produced, 1);
    assertEquals(result.outputDocumentId, null);

    const search = requestsFor(stub, 'rpc/search');
    assertEquals(search.length, 1);
    assert(isRecord(search[0].body));
    assertEquals(search[0].body.space_filter, [SPACE]);

    const links = writtenBodies(stub, 'dream_links');
    assert(Array.isArray(links[0]));
    // The self hit and the foreign-space hit are both gone.
    assertEquals(links[0].length, 1);
    assert(isRecord(links[0][0]));
    assertEquals(links[0][0].document_a, DOC_A);
    assertEquals(links[0][0].document_b, DOC_B);
    assertEquals(links[0][0].dream_run_id, RUN);
  } finally {
    await stub.close();
  }
});

Deno.test('a hit from the same source as its document is not a connection', async () => {
  const stub = stubDb(replies({ connectionB: 'conn-1' }));
  try {
    const result = await runDreamJob(dreamRun('connections'), jobDeps(stub, fakeModels(answerFor)));

    assert(result.kind === 'succeeded');
    assertEquals(result.produced, 0);
    assertEquals(writtenBodies(stub, 'dream_links').length, 0);
  } finally {
    await stub.close();
  }
});

Deno.test('a spent budget reports the stage it died in', async () => {
  const stub = stubDb(replies());
  try {
    const result = await runDreamJob(dreamRun('digest'), jobDeps(stub, fakeModels(answerFor), 0));

    assert(result.kind === 'timeout');
    assertEquals(result.stage, 'read');

    const updates = runUpdates(stub);
    assertEquals(updates[1].status, 'timeout');
    assertEquals(updates[1].finished_at, NOW.toISOString());
    assertStringIncludes(String(updates[1].error), 'read');
  } finally {
    await stub.close();
  }
});

Deno.test('an empty space succeeds with nothing produced', async () => {
  const stub = stubDb(replies({ chunks: [] }));
  try {
    const result = await runDreamJob(dreamRun('digest'), jobDeps(stub, fakeModels(answerFor)));

    assert(result.kind === 'succeeded');
    assertEquals(result.inputDocumentCount, 0);
    assertEquals(result.produced, 0);
    assertEquals(result.outputDocumentId, null);
    assertEquals(writtenBodies(stub, 'documents').length, 0);
    assertEquals(runUpdates(stub)[1].status, 'succeeded');
  } finally {
    await stub.close();
  }
});
