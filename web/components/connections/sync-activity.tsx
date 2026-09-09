'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  applyJobEvent,
  describeActivity,
  parseIngestJobEvent,
  summarizeJobs,
  type JobsById,
} from '@/lib/connections/activity';
import { createClient } from '@/lib/supabase/client';

import { StatusPill } from '@/components/app/status-pill';

/**
 * Live import progress and live failures, straight off the replication stream.
 * Everything it decides lives in lib/connections/activity; this is the socket.
 *
 * A connection changing status refreshes the server-rendered list rather than
 * being mirrored into client state, so there is one source of truth for it.
 */
export function SyncActivity({ spaceIds }: { spaceIds: readonly string[] }) {
  const [jobs, setJobs] = useState<JobsById>(() => new Map());
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('connections-activity')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingest_jobs' }, (payload) => {
        const job = parseIngestJobEvent(payload.new);
        if (job) setJobs((current) => applyJobEvent(current, job, spaceIds));
      })
      // The payload is ignored on purpose and this handler takes no argument so
      // that it cannot be read. connections is `replica identity full`, so the
      // WAL row carries every column including access_token_enc, and Realtime
      // authorizes against RLS rather than the column grant that keeps that
      // column out of a REST response. Refetching through the server is the only
      // path that respects the grant. Do not destructure the row to save a
      // round trip.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, () => {
        router.refresh();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, spaceIds]);

  const summary = summarizeJobs([...jobs.values()]);
  const description = describeActivity(summary);

  return (
    <div aria-live="polite" className="min-h-6">
      {description ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-panel)] border border-border bg-background-surface-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <StatusPill
              tone={summary.failures.length > 0 ? 'destructive' : 'progress'}
              label={description}
            />
          </div>
          {summary.failures.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {summary.failures.slice(0, 3).map((failure) => (
                <li key={failure.id} className="text-sm text-foreground-light">
                  {failure.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
