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
import { jumpingClock } from './testing.ts';
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

interface RecordingModels extends ModelRunner {
  /** The texts of each embed call, so a test can count the round trips. */
  embedCalls: string[][];
}

function fakeModels(complete: (input: CompleteInput) => string): RecordingModels {
  const embedCalls: string[][] = [];
  return {
    embedCalls,
    embed: ({ texts }) => {
      embedCalls.push(texts);
      return Promise.resolve(texts.map((_text, index) => [index, 0.5]));
    },
    complete: (input) => Promise.resolve(complete(input)),
  };
}

function jobDeps(
  stub: StubDb,
  models: ModelRunner,
  budgetMs?: number,
  now: () => Date = () => new Date(NOW.getTime()),
): JobDeps {
  return {
    db: stub.db,
    http: {
      fetch: () => Promise.reject(new Error('a dream job makes no direct http call')),
      now,
    },
    models,
    uploads: { read: () => Promise.reject(new Error('a dream job reads no uploads')) },
    budgetMs,
  };
}

/** The only four words the web client can read out of dream_runs.error. */
const STAGES = ['collect', 'extract', 'synthesize', 'write'];

/** The stage the run row names, which is everything before the first colon. */
function stageOf(error: string): string {
  const colon = error.indexOf(':');
  return colon === -1 ? '' : error.slice(0, colon);
}

/** The value of an `=eq.` filter on `column`, or null when the read sent none. */
function eqFilter(query: string, column: string): string | null {
  return new RegExp(`(?:^|&)${column}=eq\\.([^&]+)`).exec(query)?.[1] ?? null;
}

/** The values of an `=in.(a,b)` filter on `column`, or null when the read sent none. */
function inFilter(query: string, column: string): Set<string> | null {
  const list = new RegExp(`(?:^|&)${column}=in\\.\\(([^)]*)\\)`).exec(query)?.[1];
  if (list === undefined) return null;
  return new Set(list.split(',').map((value) => value.replace(/"/g, '')));
}

/**
 * Answers a read the way PostgREST would: with the rows its filters match.
 *
 * A stub that answers every read with every row cannot tell a query that scoped
 * itself to one space from one that forgot to, so the leak test it backs passes
 * whatever the code does. A read that names no space here sees every space,
 * which is what the leak looks like from the database's side.
 */
function matching(
  rows: Record<string, unknown>[],
  request: StubRequest,
): Record<string, unknown>[] {
  const space = eqFilter(request.query, 'space_id');
  const ids = inFilter(request.query, 'id');
  const documents = inFilter(request.query, 'document_id') ??
    (() => {
      const one = eqFilter(request.query, 'document_id');
      return one === null ? null : new Set([one]);
    })();

  return rows.filter((row) =>
    (space === null || row.space_id === space) &&
    (ids === null || ids.has(String(row.id))) &&
    (documents === null || documents.has(String(row.document_id)))
  );
}

/** The rows a read answers with. `foreign` adds a row a leak has something to leak. */
function chunkRows(foreign: boolean): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [
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

function documentRows(
  overrides: { connectionB?: string | null; foreign?: boolean } = {},
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [
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
  if (overrides.foreign !== true) return rows;
  return [...rows, {
    id: FOREIGN_DOC,
    title: 'A document from a space this run may not touch',
    origin: 'upload',
    connection_id: null,
    url: null,
    updated_at: '2026-09-09T11:00:00.000Z',
    space_id: FOREIGN_SPACE,
  }];
}

function searchHits(foreign: boolean): Record<string, unknown>[] {
  const hits: Record<string, unknown>[] = [
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
  overrides: {
    chunks?: Record<string, unknown>[];
    foreign?: boolean;
    connectionB?: string | null;
    /** How many documents the connections pass is given to compare. */
    compared?: number;
  } = {},
): (request: StubRequest) => StubReply | undefined {
  const foreign = overrides.foreign === true;
  return (request) => {
    if (request.table === 'chunks' && request.method === 'GET') {
      const rows = matching(overrides.chunks ?? chunkRows(foreign), request);
      // The opening chunk of one document is read as a single row rather than a
      // list, so the reply has to be shaped the way that read expects.
      if (request.query.includes('document_id=eq.')) return { body: rows[0] ?? null };
      return { body: rows };
    }
    if (request.table === 'documents' && request.method === 'GET') {
      const rows = matching(
        documentRows({ connectionB: overrides.connectionB, foreign }),
        request,
      );
      // The connections pass compares what it reads here against what it finds
      // by searching, so one document is enough unless a test asks for more.
      return {
        body: request.query.includes('origin=neq.dream')
          ? rows.slice(0, overrides.compared ?? 1)
          : rows,
      };
    }
    if (request.table === 'documents' && request.method === 'POST') {
      return { body: { id: DREAM_DOC } };
    }
    if (request.table === 'entities') {
      // The upsert answers with the rows it wrote, which is how the caller
      // learns the id to file each mention against.
      const rows = Array.isArray(request.body) ? request.body : [request.body];
      return {
        body: rows.flatMap((row, index) =>
          isRecord(row)
            ? [{
              id: `ee000000-0000-4000-8000-00000000000${index + 1}`,
              kind: row.kind,
              canonical_name: row.canonical_name,
            }]
            : []
        ),
      };
    }
    if (request.table === 'rpc/search') {
      // The rpc takes its scope in the body, so that is where a search that left
      // its space open shows up.
      const asked = isRecord(request.body) && Array.isArray(request.body.space_filter)
        ? request.body.space_filter.map(String)
        : null;
      return {
        body: searchHits(foreign).filter((hit) =>
          asked === null || asked.includes(String(hit.space_id))
        ),
      };
    }
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

function storedText(pieces: unknown[]): string {
  return pieces
    .flatMap((piece) => isRecord(piece) && typeof piece.content === 'string' ? [piece.content] : [])
    .join('\n');
}

function markersIn(text: string): string[] {
  return [...text.matchAll(/\[\[chunk:[^\]]+\]\]/g)].map((match) => match[0]);
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

/** The tables a dream run may only read within its own space. */
const SPACE_SCOPED_TABLES = ['chunks', 'documents', 'entities', 'entity_mentions', 'dream_links'];

/** Every id belonging to the space this run does not own. */
const FOREIGN_IDS = [FOREIGN_SPACE, FOREIGN_DOC, FOREIGN_CHUNK];

Deno.test('a dream run reads nothing outside its own space', async () => {
  const stub = stubDb(replies({ foreign: true }));
  try {
    for (const kind of ['entities', 'digest', 'connections'] as const) {
      const result = await runDreamJob(dreamRun(kind), jobDeps(stub, fakeModels(answerFor)));
      assertEquals(result.kind, 'succeeded');
    }

    const reads = stub.requests.filter((request) => request.method === 'GET');
    // Not vacuous: a pass that read nothing must not pass this.
    for (const table of ['chunks', 'documents']) {
      assert(reads.some((request) => request.table === table), `nothing read ${table}`);
    }

    for (const request of reads) {
      if (!SPACE_SCOPED_TABLES.includes(request.table)) continue;
      assertEquals(
        eqFilter(request.query, 'space_id'),
        SPACE,
        `a read of ${request.table} was not scoped to this space: ${request.query}`,
      );
    }

    // The search runs as the service role, where the function's own policies
    // constrain nothing, so this argument is the whole of its scope.
    const searches = requestsFor(stub, 'rpc/search');
    assert(searches.length > 0, 'nothing searched, so the scope was never tested');
    for (const search of searches) {
      assert(isRecord(search.body));
      assertEquals(search.body.space_filter, [SPACE]);
    }
  } finally {
    await stub.close();
  }
});

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
      // The space id is not the only way a foreign row reaches a write: a
      // mention or a link carries the chunk and document ids it came from, and
      // those are stamped with this run's space on the way out.
      const written = JSON.stringify(request.body ?? null);
      for (const id of FOREIGN_IDS) {
        assert(!written.includes(id), `${request.table} carried ${id}, a row from another space`);
      }
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
    assert(Array.isArray(entities[0]));
    assertEquals(entities[0].length, 1);
    assert(isRecord(entities[0][0]));
    assertEquals(entities[0][0].kind, 'person');
    assertEquals(entities[0][0].canonical_name, 'ada');
    assertEquals(entities[0][0].org_id, ORG);

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

Deno.test('a hundred entities cost two statements, not two hundred', async () => {
  // A round trip per entity spends a forty-five second budget on network waits,
  // and both writes already take an array.
  const many = JSON.stringify(
    Array.from({ length: 100 }, (_, index) => ({
      kind: 'person',
      name: `Person ${index}`,
      canonicalName: `person ${index}`,
      summary: null,
      chunkIds: [CHUNK_A],
    })),
  );
  const stub = stubDb(replies());
  try {
    const result = await runDreamJob(dreamRun('entities'), jobDeps(stub, fakeModels(() => many)));

    assert(result.kind === 'succeeded');
    assertEquals(result.produced, 100);
    assertEquals(writtenBodies(stub, 'entities').length, 1);
    assertEquals(writtenBodies(stub, 'entity_mentions').length, 1);
  } finally {
    await stub.close();
  }
});

Deno.test('an entity the model named twice is one row, mentioned from both', async () => {
  // One statement may not write the same row twice, and a model asked for a
  // hundred entities will name one of them twice.
  const twice = JSON.stringify([
    { kind: 'person', name: 'Ada', canonicalName: 'ada', summary: null, chunkIds: [CHUNK_A] },
    { kind: 'person', name: 'Ada L', canonicalName: 'ada', summary: null, chunkIds: [CHUNK_B] },
  ]);
  const stub = stubDb(replies());
  try {
    const result = await runDreamJob(dreamRun('entities'), jobDeps(stub, fakeModels(() => twice)));

    assert(result.kind === 'succeeded');
    const entities = writtenBodies(stub, 'entities');
    assert(Array.isArray(entities[0]));
    assertEquals(entities[0].length, 1);

    const mentions = writtenBodies(stub, 'entity_mentions');
    assert(Array.isArray(mentions[0]));
    assertEquals(mentions[0].length, 2);
    // Both mentions belong to the one row that was written.
    const ids = new Set(mentions[0].flatMap((row) => isRecord(row) ? [row.entity_id] : []));
    assertEquals(ids.size, 1);
  } finally {
    await stub.close();
  }
});

Deno.test('the connections pass reads and embeds a page at a time, not a document', async () => {
  // Three round trips per document is sixty for a full pass, inside a budget of
  // well under a minute. Only the searches have to be asked one at a time.
  const stub = stubDb(replies({ compared: 2 }));
  const models = fakeModels(answerFor);
  try {
    const result = await runDreamJob(dreamRun('connections'), jobDeps(stub, models));

    assert(result.kind === 'succeeded');
    const chunkReads = requestsFor(stub, 'chunks').filter((request) => request.method === 'GET');
    assertEquals(chunkReads.length, 1, 'the opening chunks were read one document at a time');
    assertEquals(models.embedCalls.length, 1, 'the documents were embedded one at a time');
    assertEquals(models.embedCalls[0].length, 2);
    assertEquals(requestsFor(stub, 'rpc/search').length, 2);
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
    // The failure knows no stage of its own, so the pass has to have left one.
    assertEquals(updates[1].error, `extract: ${result.detail}`);
    assert(STAGES.includes(stageOf(String(updates[1].error))));
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

Deno.test('a digest cites every chunk it read, in documents.source_chunk_ids', async () => {
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

    // The column, not a marker in the prose: the client resolves these through
    // RLS on read, so a reader who lost the space sees the digest without them.
    assertEquals(documents[0].source_chunk_ids, [CHUNK_A, CHUNK_B]);

    const chunks = writtenBodies(stub, 'chunks');
    assertEquals(chunks.length, 1);
    assert(Array.isArray(chunks[0]));
    // Citations are not prose, so nothing shaped like one is embedded.
    assertEquals(markersIn(storedText(chunks[0])), []);
    assert(isRecord(chunks[0][0]));
    assert(Array.isArray(chunks[0][0].embedding));
  } finally {
    await stub.close();
  }
});

Deno.test('a chunk the model invented is never cited', async () => {
  // The citation list is built from what went into the prompt, so an id the
  // model produced cannot reach the column or the stored prose.
  const stub = stubDb(replies());
  const invented = `What changed: the billing page shipped. [[chunk:${FOREIGN_CHUNK}]]`;
  try {
    const result = await runDreamJob(
      dreamRun('digest'),
      jobDeps(stub, fakeModels(() => invented)),
    );

    assert(result.kind === 'succeeded');
    const documents = writtenBodies(stub, 'documents');
    assert(isRecord(documents[0]));
    assertEquals(documents[0].source_chunk_ids, [CHUNK_A, CHUNK_B]);

    const chunks = writtenBodies(stub, 'chunks');
    assert(Array.isArray(chunks[0]));
    const text = storedText(chunks[0]);
    assert(!text.includes(FOREIGN_CHUNK), 'a chunk the model was never given was cited');
    assertEquals(markersIn(text), []);
  } finally {
    await stub.close();
  }
});

Deno.test('a run that read nothing writes no document rather than an uncited one', async () => {
  // An empty source_chunk_ids would be a claim with no source, which the spec
  // forbids outright. Producing nothing is the honest answer.
  const stub = stubDb(replies({ chunks: [] }));
  try {
    const result = await runDreamJob(dreamRun('digest'), jobDeps(stub, fakeModels(answerFor)));

    assert(result.kind === 'succeeded');
    assertEquals(result.outputDocumentId, null);
    assertEquals(writtenBodies(stub, 'documents').length, 0);
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
    assertEquals(result.stage, 'collect');

    const updates = runUpdates(stub);
    assertEquals(updates[1].status, 'timeout');
    assertEquals(updates[1].finished_at, NOW.toISOString());
    const error = String(updates[1].error);
    assertEquals(stageOf(error), 'collect');
    assertStringIncludes(error, 'collect: ');
    assertStringIncludes(error, 'ran out of time');
  } finally {
    await stub.close();
  }
});

Deno.test('every stage a run can stop in is one of the four the client knows', async () => {
  const seen = new Set<string>();
  // Walking the clock forward one reading at a time stops each kind at each of
  // its checkpoints in turn, so this reads the names off real error rows rather
  // than off the source.
  for (const kind of ['entities', 'digest', 'connections'] as const) {
    for (let ticks = 1; ticks <= 30; ticks += 1) {
      const stub = stubDb(replies());
      try {
        const result = await runDreamJob(
          dreamRun(kind),
          jobDeps(stub, fakeModels(answerFor), 1_000, jumpingClock(NOW, ticks).now),
        );
        if (result.kind !== 'timeout') continue;
        const stage = stageOf(String(runUpdates(stub)[1].error));
        assert(STAGES.includes(stage), `${kind} named a stage the client cannot read: ${stage}`);
        seen.add(stage);
      } finally {
        await stub.close();
      }
    }
  }
  assertEquals([...seen].sort(), [...STAGES].sort());
});

Deno.test('an empty space succeeds with nothing produced', async () => {
  const stub = stubDb(replies({ chunks: [] }));
  try {
    const result = await runDreamJob(dreamRun('digest'), jobDeps(stub, fakeModels(answerFor)));

    assert(result.kind === 'succeeded');
    assertEquals(result.inputDocumentCount, 0);
    assertEquals(result.produced, 0);
    assertEquals(result.outputDocumentId, null);
    // A document with no markers reads as a run that produced nothing, so an
    // uncited digest must not be written at all.
    assertEquals(writtenBodies(stub, 'documents').length, 0);
    assertEquals(writtenBodies(stub, 'chunks').length, 0);
    assertEquals(runUpdates(stub)[1].status, 'succeeded');
  } finally {
    await stub.close();
  }
});

Deno.test('citations are listed in the order the digest read them', async () => {
  // The client numbers these, so id order would number the sources at random.
  // Read order is write order, which makes source 1 the oldest thing it drew on.
  const reversed = [
    {
      id: CHUNK_B,
      document_id: DOC_B,
      ordinal: 0,
      content: 'b',
      created_at: '2026-09-09T09:00:00.000Z',
      space_id: SPACE,
    },
    {
      id: CHUNK_A,
      document_id: DOC_A,
      ordinal: 0,
      content: 'a',
      created_at: '2026-09-09T10:00:00.000Z',
      space_id: SPACE,
    },
  ];
  const stub = stubDb(replies({ chunks: reversed }));
  try {
    const result = await runDreamJob(dreamRun('digest'), jobDeps(stub, fakeModels(answerFor)));
    assert(result.kind === 'succeeded');

    const documents = writtenBodies(stub, 'documents');
    assert(isRecord(documents[0]));
    assertEquals(documents[0].source_chunk_ids, [CHUNK_B, CHUNK_A]);
  } finally {
    await stub.close();
  }
});

Deno.test('a run that stopped early records the documents it had reached', async () => {
  // The size is the whole reason a run times out, so recording zero would erase
  // the evidence on exactly the run where it matters. The client renders this
  // number in the sentence explaining why the run did not finish.
  const stopped: number[] = [];

  for (const kind of ['entities', 'digest', 'connections'] as const) {
    for (let ticks = 1; ticks <= 30; ticks += 1) {
      const stub = stubDb(replies());
      try {
        const result = await runDreamJob(
          dreamRun(kind),
          jobDeps(stub, fakeModels(answerFor), 1_000, jumpingClock(NOW, ticks).now),
        );
        if (result.kind !== 'timeout') continue;

        const terminal = runUpdates(stub)[1];
        assertEquals(terminal.status, 'timeout');
        const count = terminal.input_document_count;
        assert(typeof count === 'number', 'a timed out run recorded no document count');
        stopped.push(count);
      } finally {
        await stub.close();
      }
    }
  }

  assert(stopped.length > 0, 'no kind timed out, so nothing was measured');
  // A run stopped before its first read honestly reached nothing; one stopped
  // after has to say what it got through.
  assert(
    stopped.some((count) => count > 0),
    'every timed out run claimed to have read zero documents',
  );
});

Deno.test('a failure records what it had reached too, not a zero', async () => {
  const stub = stubDb(replies());
  try {
    // The model answers something that will not parse, which fails the entities
    // pass after the chunks have already been read.
    const result = await runDreamJob(
      dreamRun('entities'),
      jobDeps(stub, fakeModels(() => 'not json at all')),
    );

    assertEquals(result.kind, 'failed');
    const terminal = runUpdates(stub)[1];
    assertEquals(terminal.status, 'failed');
    assertEquals(terminal.input_document_count, 2);
  } finally {
    await stub.close();
  }
});
