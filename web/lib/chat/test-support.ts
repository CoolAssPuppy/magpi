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
