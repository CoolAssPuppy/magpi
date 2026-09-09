import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { StatusPill } from '@/components/app/status-pill';
import { DreamOutput } from '@/components/dreams/dream-output';
import { LinkCandidates } from '@/components/dreams/link-candidates';
import { RunFailure } from '@/components/dreams/run-failure';
import { loadDreamRun } from '@/lib/dreams/queries';
import { getSessionContext } from '@/lib/supabase/context';

import { confirmDreamLink, deleteDreamOutput, dismissDreamLink } from '../actions';

export default async function DreamRunPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const { id } = await params;
  const detail = await loadDreamRun(context, id);
  if (!detail) notFound();

  const { run, output, candidates } = detail;

  return (
    <>
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={run.status.tone} label={run.status.label} />
          <h2 className="font-heading text-base font-medium text-foreground">{run.kindLabel}</h2>
          <span className="text-sm text-foreground-light">{run.spaceName}</span>
          <Link href="/dreams" className="text-sm text-foreground-lighter hover:text-foreground">
            All runs
          </Link>
        </div>

        <p className="max-w-[var(--measure-prose)] text-sm text-foreground-light">
          {run.status.detail}
        </p>
        <p className="max-w-[var(--measure-prose)] text-sm text-foreground-lighter">
          {run.kindSummary}
        </p>
        <p className="text-xs text-foreground-lighter">
          Read {run.inputSummary} &middot; {run.duration}
        </p>
      </section>

      <RunFailure status={run.status} inputSummary={run.inputSummary} />

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-sm font-medium text-foreground">What it wrote</h2>
        <DreamOutput output={output} onDelete={deleteDreamOutput} />
      </section>

      {run.kind === 'connections' ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-sm font-medium text-foreground">Candidate pairs</h2>
          <p className="max-w-[var(--measure-prose)] text-sm text-foreground-lighter">
            Nothing here is applied until a person confirms it.
          </p>
          <LinkCandidates
            candidates={candidates}
            onConfirm={confirmDreamLink}
            onDismiss={dismissDreamLink}
          />
        </section>
      ) : null}
    </>
  );
}
