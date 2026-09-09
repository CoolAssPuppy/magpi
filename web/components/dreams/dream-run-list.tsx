import Link from 'next/link';

import { StatusPill } from '@/components/app/status-pill';
import type { DreamRunSummary } from '@/lib/dreams/view-model';

/**
 * A dream run is visible or it is not honest. Every row says what ran, over how
 * many documents, how it ended, and what came out.
 */
export function DreamRunList({ runs }: { runs: readonly DreamRunSummary[] }) {
  return (
    <ul className="divide-y divide-border rounded-[var(--radius-panel)] border border-border">
      {runs.map((run) => (
        <li key={run.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={run.status.tone} label={run.status.label} />
              <span className="text-sm font-medium text-foreground">{run.kindLabel}</span>
              <span className="text-sm text-foreground-light">{run.spaceName}</span>
            </div>
            <p className="mt-1 max-w-[var(--measure-prose)] text-sm text-foreground-light">
              {run.status.detail}
            </p>
            <p className="mt-0.5 text-xs text-foreground-lighter">
              Read {run.inputSummary} &middot; {run.duration} &middot;{' '}
              {run.outputDocumentId ? 'Wrote one document' : 'No output document'}
            </p>
          </div>

          <Link
            href={`/dreams/${run.id}`}
            className="text-sm text-brand-link hover:underline"
            aria-label={`Open this run: ${run.kindLabel} in ${run.spaceName}`}
          >
            Open this run
          </Link>
        </li>
      ))}
    </ul>
  );
}
