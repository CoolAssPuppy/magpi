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

/** Stands in for the chunks table under RLS: rows outside a reader's spaces are absent. */
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
  limit?: number;
};

export type RecordingResults = {
  single?: unknown;
  maybeSingle?: unknown;
  rows?: readonly unknown[];
  error?: { message: string } | null;
  /** Keyed by function name, for the `.rpc(name, args).single()` shape. */
  rpc?: Readonly<Record<string, { data?: unknown; error?: { message: string } | null }>>;
};

export type RecordedRpc = { name: string; args: unknown };

/** A postgrest builder that records what was asked of it, covering only what this app calls. */
export function recordingClient(results: RecordingResults): {
  supabase: SupabaseClient<Database>;
  writes: RecordedWrite[];
  reads: RecordedRead[];
  rpcCalls: RecordedRpc[];
} {
  const writes: RecordedWrite[] = [];
  const reads: RecordedRead[] = [];
  const rpcCalls: RecordedRpc[] = [];
  const error = results.error ?? null;

  const supabase = {
    rpc: (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      const result = results.rpc?.[name];
      return {
        single: () => Promise.resolve({ data: result?.data ?? null, error: result?.error ?? null }),
      };
    },

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
              const settled = Promise.resolve({ data: results.rows ?? [], error });

              return {
                limit: (count: number) => {
                  read.limit = count;
                  return settled;
                },
                then: (resolve: (value: unknown) => unknown) => settled.then(resolve),
              };
            },
          };
        },
      }),
    }),
  } as unknown as SupabaseClient<Database>;

  return { supabase, writes, reads, rpcCalls };
}
