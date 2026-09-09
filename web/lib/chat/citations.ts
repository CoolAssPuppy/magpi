import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database, Json } from '@/lib/database.types';

import type { Citation } from './protocol';

const citationIdsSchema = z.array(z.uuid());

const EXCERPT_LIMIT = 240;

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
 */
export async function resolveCitations(
  supabase: SupabaseClient<Database>,
  citations: Json,
): Promise<readonly Citation[]> {
  const ids = parseCitationIds(citations);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('chunks')
    .select('id, content, document_id, documents(title)')
    .in('id', [...ids]);

  if (error) throw new Error(error.message);

  const byId = new Map((data ?? []).map((row) => [row.id, row]));

  return ids.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];

    return [
      {
        chunkId: row.id,
        documentId: row.document_id,
        documentTitle: row.documents?.title ?? 'Untitled',
        excerpt: excerptOf(row.content),
      },
    ];
  });
}
