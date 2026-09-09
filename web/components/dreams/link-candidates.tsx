'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { StatusPill } from '@/components/app/status-pill';
import { Button } from '@/components/ui/button';
import type { ActionState } from '@/lib/actions/state';
import type { LinkCandidate, LinkedDocument, LinkState } from '@/lib/dreams/view-model';

export type LinkDecision = (linkId: string) => Promise<ActionState<undefined>>;

function DocumentLine({ document }: { document: LinkedDocument }) {
  return (
    <div className="min-w-0">
      <Link
        href={`/documents/${document.id}`}
        className="text-sm text-brand-link hover:underline"
      >
        {document.title}
      </Link>
    </div>
  );
}

function Candidate({
  candidate,
  onConfirm,
  onDismiss,
}: {
  candidate: LinkCandidate;
  onConfirm: LinkDecision;
  onDismiss: LinkDecision;
}) {
  const [failure, setFailure] = useState<string | null>(null);
  // The decision is held here as well as written, so the row reflects it without
  // waiting for the page to be read again.
  const [decided, setDecided] = useState<LinkState | null>(null);
  const [isPending, startTransition] = useTransition();
  const state = decided ?? candidate.state;

  const decide = (decision: LinkDecision, outcome: LinkState) => {
    setFailure(null);
    startTransition(async () => {
      const result = await decision(candidate.id);
      if (result.status === 'error') setFailure(result.message);
      else setDecided(outcome);
    });
  };

  return (
    <li className="flex flex-wrap items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <DocumentLine document={candidate.documentA} />
          <span className="text-xs text-foreground-lighter">and</span>
          <DocumentLine document={candidate.documentB} />
        </div>
        <p className="mt-1 max-w-[var(--measure-prose)] text-sm text-foreground-light">
          {candidate.rationale}
        </p>
        <p className="mt-0.5 text-xs text-foreground-lighter">{candidate.similarityLabel}</p>
        {failure ? (
          <p role="alert" className="mt-1 text-xs text-destructive-600">
            {failure}
          </p>
        ) : null}
      </div>

      {state === 'pending' ? (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => decide(onConfirm, 'confirmed')}
          >
            Confirm
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => decide(onDismiss, 'dismissed')}
          >
            Dismiss
          </Button>
        </div>
      ) : (
        <StatusPill
          tone={state === 'confirmed' ? 'positive' : 'neutral'}
          label={state === 'confirmed' ? 'Confirmed' : 'Dismissed'}
        />
      )}
    </li>
  );
}

/**
 * A pair the run thinks is about the same thing, waiting on a person. Nothing
 * here is applied until someone confirms it.
 */
export function LinkCandidates({
  candidates,
  onConfirm,
  onDismiss,
}: {
  candidates: readonly LinkCandidate[];
  onConfirm: LinkDecision;
  onDismiss: LinkDecision;
}) {
  if (candidates.length === 0) {
    return (
      <p className="max-w-[var(--measure-prose)] text-sm text-foreground-lighter">
        This run found no pairs of documents worth linking.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-[var(--radius-panel)] border border-border">
      {candidates.map((candidate) => (
        <Candidate
          key={candidate.id}
          candidate={candidate}
          onConfirm={onConfirm}
          onDismiss={onDismiss}
        />
      ))}
    </ul>
  );
}
