import type { Tables } from '@/lib/database.types';

export type IngestJobRecord = Pick<
  Tables<'ingest_jobs'>,
  'id' | 'space_id' | 'document_id' | 'stage' | 'status' | 'error'
>;

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

function failureReason(job: IngestJobRecord): string {
  if (job.error) return job.error;
  // A timed-out job is the expected failure on a large document, so it says
  // which stage it died in rather than reading as a sync still in flight.
  if (job.status === 'timeout') return `Timed out during ${job.stage}.`;
  return `Failed during ${job.stage}.`;
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
    parts.push(`${summary.failures.length} import${summary.failures.length === 1 ? '' : 's'} failed`);
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
