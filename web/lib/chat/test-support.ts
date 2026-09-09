import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

export type ChunkRow = {
  id: string;
  content: string;
  document_id: string;
  documents: { title: string } | null;
};

export function chunkRow(overrides: Partial<ChunkRow> = {}): ChunkRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    content: 'The SSO rollout is blocked on ENG-4417.',
    document_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    documents: { title: 'Q3 platform notes' },
    ...overrides,
  };
}

/**
 * Stands in for the chunks table as row level security leaves it for one
 * reader: rows outside their spaces are absent rather than an error.
 */
export function readerSeeing(rows: readonly ChunkRow[]): {
  supabase: SupabaseClient<Database>;
  asked: string[][];
} {
  const asked: string[][] = [];

  const supabase = {
    from: () => ({
      select: () => ({
        in: (_column: string, ids: string[]) => {
          asked.push([...ids]);
          return Promise.resolve({
            data: rows.filter((row) => ids.includes(row.id)),
            error: null,
          });
        },
      }),
    }),
  } as unknown as SupabaseClient<Database>;

  return { supabase, asked };
}

export type RecordedWrite = {
  table: string;
  operation: 'insert' | 'update';
  values: Record<string, unknown>;
  match?: readonly [string, unknown];
};

export type RecordedRead = {
  table: string;
  columns: string;
  match?: readonly [string, unknown];
  order?: readonly [string, boolean];
};

export type RecordingResults = {
  single?: unknown;
  maybeSingle?: unknown;
  rows?: readonly unknown[];
  error?: { message: string } | null;
};

/**
 * A postgrest builder that records what was asked of it. Enough of the chain to
 * pin the shape of a query, and nothing beyond what this app calls.
 */
export function recordingClient(results: RecordingResults): {
  supabase: SupabaseClient<Database>;
  writes: RecordedWrite[];
  reads: RecordedRead[];
} {
  const writes: RecordedWrite[] = [];
  const reads: RecordedRead[] = [];
  const error = results.error ?? null;

  const supabase = {
    from: (table: string) => ({
      insert: (values: Record<string, unknown>) => {
        writes.push({ table, operation: 'insert', values });
        return {
          select: () => ({
            single: () => Promise.resolve({ data: results.single ?? null, error }),
          }),
        };
      },

      update: (values: Record<string, unknown>) => ({
        eq: (column: string, value: unknown) => {
          writes.push({ table, operation: 'update', values, match: [column, value] });
          return Promise.resolve({ error });
        },
      }),

      select: (columns: string) => ({
        eq: (column: string, value: unknown) => {
          const read: RecordedRead = { table, columns, match: [column, value] };
          reads.push(read);
          return {
            maybeSingle: () => Promise.resolve({ data: results.maybeSingle ?? null, error }),
            order: (orderColumn: string, options: { ascending: boolean }) => {
              read.order = [orderColumn, options.ascending];
              return Promise.resolve({ data: results.rows ?? [], error });
            },
          };
        },
      }),
    }),
  } as unknown as SupabaseClient<Database>;

  return { supabase, writes, reads };
}
