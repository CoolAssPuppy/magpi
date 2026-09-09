import { z } from 'zod';

import type { Tables } from '@/lib/database.types';

export type IngestJobRecord = Pick<
  Tables<'ingest_jobs'>,
  'id' | 'space_id' | 'document_id' | 'stage' | 'status' | 'error'
>;

/**
 * A replication payload is a boundary like any other, so it is parsed rather
 * than asserted. A row shape this app does not recognise is dropped instead of
 * being counted as an import.
 */
const ingestJobEventSchema = z.object({
  id: z.string(),
  space_id: z.string(),
  document_id: z.string(),
  stage: z.enum(['fetch', 'extract', 'chunk', 'embed', 'store']),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'timeout']),
  error: z.string().nullable(),
});

export function parseIngestJobEvent(payload: unknown): IngestJobRecord | null {
  const parsed = ingestJobEventSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export type ImportFailure = {
  readonly id: string;
  readonly documentId: string;
  readonly stage: string;
  readonly reason: string;
};

export type ActivitySummary = {
  readonly running: number;
  readonly queued: number;
  readonly failures: readonly ImportFailure[];
};

/**
 * The stage comes first because ingest_jobs records it as a column, and a
 * stalled import is only legible if it says where it stalled.
 *
 * The driver's message follows, and finishing it is this side's job because this
 * side owns the words in front of it. Drivers write a clause for a timeout and a
 * whole sentence for a failure, and both read correctly after a full stop.
 *
 * A check constraint makes a terminal job without an error impossible, so the
 * bare prefix is only there to keep the function total against a column the
 * generated type still calls nullable.
 *
 * Duplicated from asSentence in lib/dreams/status.ts, which joins the dream
 * equivalent. Four lines, two callers, and it wants a shared module the way the
 * status pill did.
 */
function asSentence(message: string): string {
  const trimmed = message.trim();
  const opened = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return opened.endsWith('.') ? opened : `${opened}.`;
}

function failureReason(job: IngestJobRecord): string {
  const prefix =
    job.status === 'timeout' ? `Timed out during ${job.stage}.` : `Failed during ${job.stage}.`;
  return job.error ? `${prefix} ${asSentence(job.error)}` : prefix;
}

export function summarizeJobs(jobs: readonly IngestJobRecord[]): ActivitySummary {
  return {
    running: jobs.filter((job) => job.status === 'running').length,
    queued: jobs.filter((job) => job.status === 'queued').length,
    failures: jobs
      .filter((job) => job.status === 'failed' || job.status === 'timeout')
      .map((job) => ({
        id: job.id,
        documentId: job.document_id,
        stage: job.stage,
        reason: failureReason(job),
      })),
  };
}

export function describeActivity(summary: ActivitySummary): string | null {
  const parts: string[] = [];

  if (summary.running > 0) {
    parts.push(`Importing ${summary.running} document${summary.running === 1 ? '' : 's'}`);
  }
  if (summary.queued > 0) parts.push(`${summary.queued} waiting`);
  if (summary.failures.length > 0) {
    parts.push(
      `${summary.failures.length} import${summary.failures.length === 1 ? '' : 's'} failed`,
    );
  }

  return parts.length > 0 ? parts.join(', ') : null;
}

export type JobsById = ReadonlyMap<string, IngestJobRecord>;

export function applyJobEvent(
  jobs: JobsById,
  job: IngestJobRecord,
  watchedSpaceIds?: readonly string[],
): JobsById {
  if (watchedSpaceIds && !watchedSpaceIds.includes(job.space_id)) return jobs;

  const next = new Map(jobs);
  next.set(job.id, job);
  return next;
}
