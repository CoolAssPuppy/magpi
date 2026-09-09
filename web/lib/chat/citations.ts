import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database, Json } from '@/lib/database.types';

import type { Citation } from './protocol';

const citationIdsSchema = z.array(z.uuid());

const EXCERPT_LIMIT = 240;

type Client = SupabaseClient<Database>;

type ChunkRow = {
  readonly id: string;
  readonly content: string;
  readonly document_id: string;
  readonly documents: { readonly title: string } | null;
};

/**
 * messages.citations holds chunk ids and nothing else. A shape this refuses is
 * our own writer's bug, and it should be loud rather than silently uncited.
 */
export function parseCitationIds(value: Json): readonly string[] {
  return citationIdsSchema.parse(value);
}

export function excerptOf(content: string): string {
  const collapsed = content.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= EXCERPT_LIMIT) return collapsed;

  const cut = collapsed.slice(0, EXCERPT_LIMIT);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}...`;
}

/**
 * Citations resolve on read, through the reader's own client. A conversation
 * whose author later lost access to a space keeps its answer text and quietly
 * loses the citation, which is the correct outcome and not an error.
 *
 * The label is the position the chunk held when the answer was written, so a
 * dropped source leaves a gap rather than renumbering the ones that remain.
 */
export async function resolveCitations(
  supabase: Client,
  citations: Json,
): Promise<readonly Citation[]> {
  const [only] = await resolveCitationSets(supabase, [citations]);
  return only;
}

/** One query for a whole conversation, rather than one per assistant turn. */
export async function resolveCitationSets(
  supabase: Client,
  sets: readonly Json[],
): Promise<readonly (readonly Citation[])[]> {
  const idSets = sets.map(parseCitationIds);
  const unique = [...new Set(idSets.flat())];
  const rows = await fetchChunks(supabase, unique);

  return idSets.map((ids) =>
    ids.flatMap((id, index) => {
      const row = rows.get(id);
      if (!row) return [];

      return [
        {
          chunkId: row.id,
          documentId: row.document_id,
          documentTitle: row.documents?.title ?? 'Untitled',
          excerpt: excerptOf(row.content),
          label: index + 1,
        },
      ];
    }),
  );
}

async function fetchChunks(
  supabase: Client,
  ids: readonly string[],
): Promise<ReadonlyMap<string, ChunkRow>> {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from('chunks')
    .select('id, content, document_id, documents(title)')
    .in('id', [...ids]);

  if (error) throw new Error(error.message);

  return new Map((data ?? []).map((row) => [row.id, row]));
}
