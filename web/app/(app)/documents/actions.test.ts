import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionState } from '@/lib/actions/state';
import type { SessionContext } from '@/lib/supabase/context';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '33333333-3333-4333-8333-333333333333';
const DOCUMENT_ID = '55555555-5555-4555-8555-555555555555';

type Write = { table: string; operation: string; values?: unknown; match?: unknown };
type Read = { table: string; columns: string; match?: unknown };

const dbState = {
  writes: [] as Write[],
  reads: [] as Read[],
  rpcCalls: [] as { name: string; args: unknown }[],
  space: { id: SPACE_ID } as { id: string } | null,
  allowance: { allowed: true, reason: null } as { allowed: boolean; reason: string | null },
  allowanceError: null as { message: string } | null,
  documentError: null as { message: string } | null,
  jobError: null as { message: string } | null,
  deleteError: null as { message: string } | null,
  revalidated: [] as string[],
};

/** The caller's own client: what row level security lets this person see. */
function callerSupabase() {
  return {
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: unknown) => {
          dbState.reads.push({ table, columns, match: [column, value] });
          return { maybeSingle: async () => ({ data: dbState.space, error: null }) };
        },
      }),
      delete: () => ({
        eq: async (column: string, value: unknown) => {
          dbState.writes.push({ table, operation: 'delete', match: [column, value] });
          return { error: dbState.deleteError };
        },
      }),
    }),
    rpc: (name: string, args: unknown) => {
      dbState.rpcCalls.push({ name, args });
      return {
        single: async () => ({ data: dbState.allowance, error: dbState.allowanceError }),
      };
    },
  };
}

vi.mock('@/lib/actions/with-session', () => ({
  withSession: async <T>(
    run: (context: SessionContext) => Promise<ActionState<T>>,
    revalidate: string,
  ): Promise<ActionState<T>> => {
    const result = await run({
      userId: '77777777-7777-4777-8777-777777777777',
      email: 'reader@example.com',
      orgId: ORG_ID,
      role: 'member',
      supabase: callerSupabase(),
    } as unknown as SessionContext);

    if (result.status === 'success') dbState.revalidated.push(revalidate);
    return result;
  },
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      insert: (values: unknown) => {
        dbState.writes.push({ table, operation: 'insert', values });
        const error = table === 'documents' ? dbState.documentError : dbState.jobError;
        return {
          select: () => ({
            single: async () => ({
              data: dbState.documentError ? null : { id: DOCUMENT_ID },
              error: dbState.documentError,
            }),
          }),
          then: (resolve: (value: { error: { message: string } | null }) => unknown) =>
            Promise.resolve({ error }).then(resolve),
        };
      },
    }),
  }),
}));

const { deleteDreamDocument, enqueueUploadedDocument } = await import('./actions');

const upload = (overrides: Partial<Parameters<typeof enqueueUploadedDocument>[0]> = {}) => ({
  spaceId: SPACE_ID,
  storagePath: `${SPACE_ID}/quarterly-plan.pdf`,
  title: 'quarterly-plan.pdf',
  mimeType: 'application/pdf',
  ...overrides,
});

const writesTo = (table: string) => dbState.writes.filter((write) => write.table === table);

beforeEach(() => {
  dbState.writes = [];
  dbState.reads = [];
  dbState.rpcCalls = [];
  dbState.space = { id: SPACE_ID };
  dbState.allowance = { allowed: true, reason: null };
  dbState.allowanceError = null;
  dbState.documentError = null;
  dbState.jobError = null;
  dbState.deleteError = null;
  dbState.revalidated = [];
});

describe('recording an uploaded file as a document', () => {
  it('proves the uploader is in the space through their own client before anything is written', async () => {
    await enqueueUploadedDocument(upload());

    expect(dbState.reads[0]).toEqual({
      table: 'spaces',
      columns: 'id',
      match: ['id', SPACE_ID],
    });
  });

  it('refuses a file aimed at a space the uploader is not in', async () => {
    dbState.space = null;

    const state = await enqueueUploadedDocument(upload());

    expect(state).toEqual({ status: 'error', message: 'You are not in that space.' });
    expect(dbState.writes).toEqual([]);
  });

  it('refuses an upload it cannot make sense of rather than guessing at it', async () => {
    const state = await enqueueUploadedDocument(upload({ spaceId: 'the-engineering-space' }));

    expect(state).toEqual({ status: 'error', message: 'That upload could not be recorded.' });
    expect(dbState.writes).toEqual([]);
  });

  it('refuses a file with no name to file it under', async () => {
    const state = await enqueueUploadedDocument(upload({ title: '   ' }));

    expect(state).toEqual({ status: 'error', message: 'That upload could not be recorded.' });
  });

  it('asks the organization, not the space, whether another document fits in the plan', async () => {
    await enqueueUploadedDocument(upload());

    expect(dbState.rpcCalls).toEqual([{ name: 'check_ingest_allowed', args: { p_org_id: ORG_ID } }]);
  });

  it('stops a full plan at the door and says which limit was hit', async () => {
    dbState.allowance = { allowed: false, reason: 'The free plan holds 100 documents.' };

    const state = await enqueueUploadedDocument(upload());

    expect(state).toEqual({
      status: 'error',
      message: 'The free plan holds 100 documents.',
    });
    expect(dbState.writes).toEqual([]);
  });

  it('still says the plan is full when the check gave no reason of its own', async () => {
    dbState.allowance = { allowed: false, reason: null };

    const state = await enqueueUploadedDocument(upload());

    expect(state).toEqual({ status: 'error', message: 'This plan is full.' });
  });

  it('passes on a plan check that could not run at all', async () => {
    dbState.allowanceError = { message: 'function check_ingest_allowed does not exist' };

    const state = await enqueueUploadedDocument(upload());

    expect(state).toEqual({
      status: 'error',
      message: 'function check_ingest_allowed does not exist',
    });
  });

  it('files the document in the space that was chosen, against the caller organization', async () => {
    await enqueueUploadedDocument(
      upload({ title: 'Q3 platform notes', storagePath: `${SPACE_ID}/q3.pdf` }),
    );

    expect(writesTo('documents')[0].values).toEqual({
      org_id: ORG_ID,
      space_id: SPACE_ID,
      title: 'Q3 platform notes',
      mime_type: 'application/pdf',
      storage_path: `${SPACE_ID}/q3.pdf`,
      origin: 'upload',
    });
  });

  it('queues the new document to be read, starting at extraction', async () => {
    const state = await enqueueUploadedDocument(upload());

    expect(writesTo('ingest_jobs')[0].values).toEqual({
      org_id: ORG_ID,
      space_id: SPACE_ID,
      document_id: DOCUMENT_ID,
      stage: 'extract',
    });
    expect(state).toEqual({ status: 'success', data: { documentId: DOCUMENT_ID } });
  });

  it('counts the document against what the organization has used', async () => {
    await enqueueUploadedDocument(upload());

    expect(writesTo('usage_events')[0].values).toEqual({
      org_id: ORG_ID,
      kind: 'document_ingested',
      quantity: 1,
    });
  });

  it('reports a document that could not be written instead of a success nobody has', async () => {
    dbState.documentError = { message: 'duplicate key value violates unique constraint' };

    const state = await enqueueUploadedDocument(upload());

    expect(state).toEqual({
      status: 'error',
      message: 'duplicate key value violates unique constraint',
    });
    expect(writesTo('ingest_jobs')).toEqual([]);
  });

  it('reports a document nothing was queued to read, which would otherwise sit there forever', async () => {
    dbState.jobError = { message: 'insert or update on table ingest_jobs violates check' };

    const state = await enqueueUploadedDocument(upload());

    expect(state).toEqual({
      status: 'error',
      message: 'insert or update on table ingest_jobs violates check',
    });
    expect(writesTo('usage_events')).toEqual([]);
  });

  it('puts the new document on the documents screen once it is in', async () => {
    await enqueueUploadedDocument(upload());

    expect(dbState.revalidated).toEqual(['/documents']);
  });
});

describe('deleting a document a dream run wrote', () => {
  const form = (documentId?: string) => {
    const data = new FormData();
    if (documentId !== undefined) data.set('documentId', documentId);
    return data;
  };

  it('deletes through the caller own client, so the database decides what may go', async () => {
    const state = await deleteDreamDocument(form(DOCUMENT_ID));

    expect(dbState.writes).toEqual([
      { table: 'documents', operation: 'delete', match: ['id', DOCUMENT_ID] },
    ]);
    expect(state).toEqual({ status: 'success', data: undefined });
  });

  it('refuses a delete that named no document', async () => {
    const state = await deleteDreamDocument(form());

    expect(state).toEqual({ status: 'error', message: 'That document could not be deleted.' });
    expect(dbState.writes).toEqual([]);
  });

  it('passes the refusal back when the database will not delete it', async () => {
    dbState.deleteError = { message: 'Only a dream document can be deleted.' };

    const state = await deleteDreamDocument(form(DOCUMENT_ID));

    expect(state).toEqual({ status: 'error', message: 'Only a dream document can be deleted.' });
  });
});
