import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { Database } from '@/lib/database.types';

import {
  describeIngest,
  describeOrigin,
  listDocuments,
  type DocumentOrigin,
  type IngestStage,
  type IngestStatus,
  type IngestSummary,
} from './documents';

const ingest = (overrides: Partial<IngestSummary> = {}): IngestSummary => ({
  status: 'running',
  stage: 'embed',
  error: null,
  ...overrides,
});

describe('what an import says while it is happening', () => {
  it('names the stage it is on', () => {
    expect(describeIngest(ingest({ status: 'running', stage: 'chunk' }))).toBe(
      'Reading, at the chunk stage',
    );
  });

  it('says a queued document is waiting rather than leaving it looking finished', () => {
    expect(describeIngest(ingest({ status: 'queued', stage: 'extract' }))).toBe(
      'Waiting to be read',
    );
  });

  it('says nothing once the document is in', () => {
    expect(describeIngest(ingest({ status: 'succeeded' }))).toBeNull();
  });

  it('shows the real error rather than a spinner that never resolves', () => {
    expect(describeIngest(ingest({ status: 'failed', error: 'The PDF has no text layer.' }))).toBe(
      'The PDF has no text layer.',
    );
  });

  it('falls back to the stage when a failure carried no message', () => {
    expect(describeIngest(ingest({ status: 'failed', stage: 'extract', error: null }))).toBe(
      'Failed at the extract stage',
    );
  });

  it('says a timed-out job ran out of time, and where', () => {
    expect(describeIngest(ingest({ status: 'timeout', stage: 'embed' }))).toBe(
      'Ran out of time at the embed stage. This document is too large for one job.',
    );
  });

  it('says nothing when there is no job at all', () => {
    expect(describeIngest(null)).toBeNull();
  });
});

describe('where a document came from', () => {
  it('distinguishes a dream output from anything a person put in', () => {
    expect(describeOrigin('upload')).toBe('Uploaded');
    expect(describeOrigin('sync')).toBe('Synced');
    expect(describeOrigin('dream')).toBe('Written by a dream run');
  });
});

const SPACE_ID = '33333333-3333-4333-8333-333333333333';

type DocumentJoinRow = {
  readonly id: string;
  readonly title: string;
  readonly space_id: string;
  readonly origin: DocumentOrigin;
  readonly updated_at: string;
  readonly spaces: { readonly name: string } | null;
  readonly ingest_jobs: readonly {
    readonly status: IngestStatus;
    readonly stage: IngestStage;
    readonly error: string | null;
  }[];
};

const documentRow = (overrides: Partial<DocumentJoinRow> = {}): DocumentJoinRow => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  title: 'Q3 platform notes',
  space_id: SPACE_ID,
  origin: 'upload',
  updated_at: '2026-09-09T11:30:00.000Z',
  spaces: { name: 'Engineering' },
  ingest_jobs: [],
  ...overrides,
});

type QueryCall = readonly [string, ...unknown[]];

/** A postgrest builder double that records the filter chain. The cast stays here. */
function documentsTable(result: {
  rows?: readonly DocumentJoinRow[] | null;
  error?: { message: string };
}): { supabase: SupabaseClient<Database>; calls: readonly QueryCall[] } {
  const calls: QueryCall[] = [];
  const settled = {
    data: result.rows === undefined ? [] : result.rows,
    error: result.error ?? null,
  };

  const builder: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(settled).then(resolve),
  };

  for (const method of ['select', 'order', 'limit', 'eq']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }

  const supabase = {
    from: (table: string) => {
      calls.push(['from', table]);
      return builder;
    },
  } as unknown as SupabaseClient<Database>;

  return { supabase, calls };
}

describe('the documents a reader is shown', () => {
  it('puts the most recently changed document at the top of one page of fifty', async () => {
    const { supabase, calls } = documentsTable({ rows: [documentRow()] });

    await listDocuments(supabase);

    expect(calls).toContainEqual(['from', 'documents']);
    expect(calls).toContainEqual(['order', 'updated_at', { ascending: false }]);
    expect(calls).toContainEqual(['limit', 50]);
  });

  it('takes a longer page when the screen asks for one', async () => {
    const { supabase, calls } = documentsTable({ rows: [] });

    await listDocuments(supabase, { limit: 5 });

    expect(calls).toContainEqual(['limit', 5]);
  });

  it('reads the newest import job, so the list cannot disagree with the document page', async () => {
    const { supabase, calls } = documentsTable({ rows: [documentRow()] });

    await listDocuments(supabase);

    expect(calls).toContainEqual([
      'order',
      'updated_at',
      { ascending: false, referencedTable: 'ingest_jobs' },
    ]);
    expect(calls).toContainEqual(['limit', 1, { referencedTable: 'ingest_jobs' }]);
  });

  it('narrows to the one space a reader picked', async () => {
    const { supabase, calls } = documentsTable({ rows: [documentRow()] });

    await listDocuments(supabase, { spaceId: SPACE_ID });

    expect(calls).toContainEqual(['eq', 'space_id', SPACE_ID]);
  });

  it('filters by no space at all when the reader picked none', async () => {
    const { supabase, calls } = documentsTable({ rows: [documentRow()] });

    await listDocuments(supabase);

    expect(calls.some(([method]) => method === 'eq')).toBe(false);
  });

  it('names the space each document went into', async () => {
    const { supabase } = documentsTable({
      rows: [documentRow({ spaces: { name: 'Engineering' } })],
    });

    const [document] = await listDocuments(supabase);

    expect(document.spaceName).toBe('Engineering');
  });

  it('says a space is unknown rather than blank when its row is out of reach', async () => {
    const { supabase } = documentsTable({ rows: [documentRow({ spaces: null })] });

    const [document] = await listDocuments(supabase);

    expect(document.spaceName).toBe('Unknown space');
  });

  it('carries a failed import through with the reason it failed', async () => {
    const { supabase } = documentsTable({
      rows: [
        documentRow({
          ingest_jobs: [
            { status: 'failed', stage: 'extract', error: 'The PDF has no text layer.' },
          ],
        }),
      ],
    });

    const [document] = await listDocuments(supabase);

    expect(document.ingest).toEqual({
      status: 'failed',
      stage: 'extract',
      error: 'The PDF has no text layer.',
    });
  });

  it('reports no import at all for a document nothing was queued for', async () => {
    const { supabase } = documentsTable({ rows: [documentRow({ ingest_jobs: [] })] });

    const [document] = await listDocuments(supabase);

    expect(document.ingest).toBeNull();
  });

  it('keeps the identity, origin and date the list is drawn from', async () => {
    const { supabase } = documentsTable({
      rows: [
        documentRow({
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          title: 'Engineering digest',
          origin: 'dream',
          updated_at: '2026-09-01T08:00:00.000Z',
        }),
      ],
    });

    const [document] = await listDocuments(supabase);

    expect(document).toMatchObject({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      title: 'Engineering digest',
      spaceId: SPACE_ID,
      origin: 'dream',
      updatedAt: '2026-09-01T08:00:00.000Z',
    });
  });

  it('reads an empty answer as an empty shelf, not as a failure', async () => {
    const { supabase } = documentsTable({ rows: null });

    expect(await listDocuments(supabase)).toEqual([]);
  });

  it('raises the refusal the database gave rather than showing an empty shelf', async () => {
    const { supabase } = documentsTable({
      error: { message: 'permission denied for table documents' },
    });

    await expect(listDocuments(supabase)).rejects.toThrow('permission denied for table documents');
  });
});
