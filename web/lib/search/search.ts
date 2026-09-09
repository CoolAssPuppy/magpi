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

  const chunks = (data ?? []).map((hit) => ({
    chunkId: hit.chunk_id,
    documentId: hit.document_id,
    spaceId: hit.space_id,
    content: hit.content,
    score: hit.score,
  }));

  await recordRetrieval(deps.supabase, chunks);
  return chunks;
}

/**
 * Marks the documents this search returned as read.
 *
 * `documents.last_retrieved_at` and `retrieval_count` are what the admin
 * dead-content panel reads, and nothing wrote either, so the panel reported
 * every document in the organization as never retrieved.
 *
 * Distinct document ids, so a document that matched five chunks counts once. A
 * failure is logged and swallowed: the reader has their passages and losing a
 * count on an analytics panel is not worth failing their question over.
 */
async function recordRetrieval(
  supabase: SupabaseClient<Database>,
  chunks: readonly RetrievedChunk[],
): Promise<void> {
  const documentIds = [...new Set(chunks.map((chunk) => chunk.documentId))];
  if (documentIds.length === 0) return;

  const { error } = await supabase.rpc('record_retrieval', { p_document_ids: documentIds });
  if (error) console.error('retrieval not recorded', { error });
}
