import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

export type DocumentOrigin = Database['public']['Enums']['document_origin'];
export type IngestStatus = Database['public']['Enums']['ingest_status'];
export type IngestStage = Database['public']['Enums']['ingest_stage'];

export type DocumentSummary = {
  readonly id: string;
  readonly title: string;
  readonly spaceId: string;
  readonly spaceName: string;
  readonly origin: DocumentOrigin;
  readonly updatedAt: string;
  readonly ingest: IngestSummary | null;
};

export type IngestSummary = {
  readonly status: IngestStatus;
  readonly stage: IngestStage;
  readonly error: string | null;
};

export function describeOrigin(origin: DocumentOrigin): string {
  switch (origin) {
    case 'upload':
      return 'Uploaded';
    case 'sync':
      return 'Synced';
    case 'dream':
      return 'Written by a dream run';
    default: {
      const exhaustive: never = origin;
      return exhaustive;
    }
  }
}

/** What a stalled import says to the reader. A timed-out job names the stage it died in. */
export function describeIngest(ingest: IngestSummary | null): string | null {
  if (!ingest) return null;

  switch (ingest.status) {
    case 'queued':
      return 'Waiting to be read';
    case 'running':
      return `Reading, at the ${ingest.stage} stage`;
    case 'succeeded':
      return null;
    case 'failed':
      return ingest.error ?? `Failed at the ${ingest.stage} stage`;
    case 'timeout':
      return `Ran out of time at the ${ingest.stage} stage. This document is too large for one job.`;
    default: {
      const exhaustive: never = ingest.status;
      return exhaustive;
    }
  }
}

export async function listDocuments(
  supabase: SupabaseClient<Database>,
  options: { spaceId?: string; limit?: number } = {},
): Promise<readonly DocumentSummary[]> {
  let query = supabase
    .from('documents')
    .select(
      'id, title, space_id, origin, updated_at, spaces(name), ingest_jobs(status, stage, error)',
    )
    .order('updated_at', { ascending: false })
    // A document can carry several import attempts, and only the newest says where it stands.
    .order('updated_at', { ascending: false, referencedTable: 'ingest_jobs' })
    .limit(1, { referencedTable: 'ingest_jobs' })
    .limit(options.limit ?? 50);

  if (options.spaceId) query = query.eq('space_id', options.spaceId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    spaceId: row.space_id,
    spaceName: row.spaces?.name ?? 'Unknown space',
    origin: row.origin,
    updatedAt: row.updated_at,
    ingest: row.ingest_jobs[0]
      ? {
          status: row.ingest_jobs[0].status,
          stage: row.ingest_jobs[0].stage,
          error: row.ingest_jobs[0].error,
        }
      : null,
  }));
}
