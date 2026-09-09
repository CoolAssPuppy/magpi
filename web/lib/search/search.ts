import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { embed, type Embedding } from '@/lib/openai/embed';

export type RetrievedChunk = {
  readonly chunkId: string;
  readonly documentId: string;
  readonly spaceId: string;
  readonly content: string;
  readonly score: number;
};

export type SearchInput = {
  readonly queryText: string;
  readonly spaceFilter: readonly string[] | null;
  readonly matchCount: number;
  readonly orgId: string;
};

export type SearchDeps = {
  readonly supabase: SupabaseClient<Database>;
  readonly embed?: (texts: readonly string[], orgId: string) => Promise<readonly Embedding[]>;
};

export const DEFAULT_MATCH_COUNT = 12;

/** pgvector reads a bracketed list. postgrest sends the parameter as text. */
export function serializeEmbedding(vector: Embedding): string {
  return `[${vector.join(',')}]`;
}

/**
 * The one retrieval path. It goes through the caller's client rather than the
 * service client, so the security-invoker `search` function sees the reader's
 * own row level security. A second implementation anywhere is a bug.
 */
export async function searchChunks(
  input: SearchInput,
  deps: SearchDeps,
): Promise<readonly RetrievedChunk[]> {
  const queryText = input.queryText.trim();
  if (queryText === '') return [];

  const embedTexts = deps.embed ?? ((texts, orgId) => embed({ texts, orgId }));
  const [queryEmbedding] = await embedTexts([queryText], input.orgId);

  const { data, error } = await deps.supabase.rpc('search', {
    query_embedding: serializeEmbedding(queryEmbedding),
    query_text: queryText,
    match_count: input.matchCount,
    ...(input.spaceFilter ? { space_filter: [...input.spaceFilter] } : {}),
  });

  if (error) throw new Error(error.message);

  return (data ?? []).map((hit) => ({
    chunkId: hit.chunk_id,
    documentId: hit.document_id,
    spaceId: hit.space_id,
    content: hit.content,
    score: hit.score,
  }));
}
