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

type Upload = Parameters<typeof enqueueUploadedDocument>[0];

const upload = (overrides: Partial<Upload> = {}): Upload => ({
  spaceId: SPACE_ID,
  objectName: 'quarterly-plan.pdf',
  title: 'quarterly-plan.pdf',
  mimeType: 'application/pdf',
  ...overrides,
});

/**
 * A server action's argument arrives off the wire. The type on its signature
 * describes the client this repo ships, not what the action can be sent, and
 * the input worth testing is the input a typed caller cannot express.
 */
const fromTheWire = (input: Record<string, unknown>) =>
  enqueueUploadedDocument(input as unknown as Upload);

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

    expect(dbState.rpcCalls).toEqual([
      { name: 'check_ingest_allowed', args: { p_org_id: ORG_ID } },
    ]);
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

  it('reports a plan check that could not run at all, without naming the function', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    dbState.allowanceError = { message: 'function check_ingest_allowed does not exist' };

    const state = await enqueueUploadedDocument(upload());

    expect(state).toEqual({ status: 'error', message: 'That upload could not be recorded.' });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("files the document in the chosen space, under the uploader's organization", async () => {
    await enqueueUploadedDocument(upload({ title: 'Q3 platform notes', objectName: 'q3.pdf' }));

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

  // The path was an input for the whole build, validated as z.string().min(1)
  // and written by the service client, which skips RLS. A caller posting
  // `<another space>/board-minutes.pdf` had that object read and indexed into a
  // space they are a member of, and the citation then renders its text.
  it('reads only the space it just checked, whatever path the caller asks for', async () => {
    await enqueueUploadedDocument(upload({ objectName: '../other-space/board-minutes.pdf' }));

    expect(writesTo('documents')).toEqual([]);
  });

  it('refuses a name that reaches out of its own folder', async () => {
    const state = await enqueueUploadedDocument(upload({ objectName: 'nested/report.pdf' }));

    expect(state).toEqual({ status: 'error', message: 'That upload could not be recorded.' });
    expect(dbState.writes).toEqual([]);
  });

  // The extractor answers 415 for anything outside its table, so a document
  // recorded with a type nothing can read is queued only to fail three jobs
  // later. The upload surface is where that is knowable.
  it('refuses a type nothing downstream can read', async () => {
    const state = await fromTheWire({ ...upload(), mimeType: 'image/png' });

    expect(state).toEqual({ status: 'error', message: 'That upload could not be recorded.' });
    expect(dbState.writes).toEqual([]);
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
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    dbState.documentError = { message: 'duplicate key value violates unique constraint' };

    const state = await enqueueUploadedDocument(upload());

    expect(state).toEqual({ status: 'error', message: 'That upload could not be recorded.' });
    expect(writesTo('ingest_jobs')).toEqual([]);
    consoleError.mockRestore();
  });

  // The document row is in by this point, so the copy has to say what the reader
  // is looking at: a file that will sit there unread until they upload it again.
  it('reports a document nothing was queued to read, which would otherwise sit there forever', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    dbState.jobError = { message: 'insert or update on table ingest_jobs violates check' };

    const state = await enqueueUploadedDocument(upload());

    expect(state).toEqual({
      status: 'error',
      message: 'That file was saved but nothing was queued to read it. Upload it again.',
    });
    expect(writesTo('usage_events')).toEqual([]);
    consoleError.mockRestore();
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

  it('deletes as the person asking, so the database decides what may go', async () => {
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

  it('reports a refusal in terms the reader can act on when the database will not delete it', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    dbState.deleteError = { message: 'new row violates row-level security policy' };

    const state = await deleteDreamDocument(form(DOCUMENT_ID));

    expect(state).toEqual({ status: 'error', message: 'That document could not be deleted.' });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
