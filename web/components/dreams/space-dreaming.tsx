'use client';

import { useId, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { ActionState } from '@/lib/actions/state';
import { DREAM_KINDS, describeDreamKind, type DreamKind } from '@/lib/dreams/status';

export type DreamingSpace = {
  readonly id: string;
  readonly name: string;
  readonly dreaming_enabled: boolean;
};

function SpaceRow({
  space,
  onToggle,
  onRun,
}: {
  space: DreamingSpace;
  onToggle: (spaceId: string, enabled: boolean) => Promise<ActionState<undefined>>;
  onRun: (spaceId: string, kind: DreamKind) => Promise<ActionState<undefined>>;
}) {
  const kindFieldId = useId();
  const [kind, setKind] = useState<DreamKind>('digest');
  // Held here as well as written, so the switch shows the value that was saved
  // rather than snapping back until the page is read again.
  const [isDreaming, setDreaming] = useState(space.dreaming_enabled);
  const [failure, setFailure] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = (work: () => Promise<ActionState<undefined>>, onDone?: () => void) => {
    setFailure(null);
    startTransition(async () => {
      const result = await work();
      if (result.status === 'error') setFailure(result.message);
      else onDone?.();
    });
  };

  return (
    <div role="group" aria-label={space.name} className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Switch
            checked={isDreaming}
            aria-label={`Dreaming in ${space.name}`}
            disabled={isPending}
            onCheckedChange={(next) =>
              run(
                () => onToggle(space.id, next),
                () => setDreaming(next),
              )
            }
          />
          <span className="text-sm text-foreground">{space.name}</span>
          {isDreaming ? null : (
            <span className="text-xs text-foreground-lighter">Dreaming is off in this space</span>
          )}
        </div>

        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={kindFieldId} className="text-xs text-foreground-lighter">
              Kind
            </label>
            <select
              id={kindFieldId}
              value={kind}
              disabled={!isDreaming || isPending}
              onChange={(event) => {
                const chosen = DREAM_KINDS.find((candidate) => candidate === event.target.value);
                if (chosen) setKind(chosen);
              }}
              className="h-8 rounded-[var(--radius-panel)] border border-border-strong bg-background-surface-100 px-2 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:outline-none"
            >
              {DREAM_KINDS.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {describeDreamKind(candidate).label}
                </option>
              ))}
            </select>
          </div>

          <Button
            size="sm"
            variant="outline"
            disabled={!isDreaming || isPending}
            onClick={() => run(() => onRun(space.id, kind))}
          >
            Run now
          </Button>
        </div>
      </div>

      <p className="max-w-[var(--measure-prose)] text-xs text-foreground-lighter">
        {describeDreamKind(kind).summary}
      </p>

      {failure ? (
        <p role="alert" className="text-xs text-destructive-600">
          {failure}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Dreaming is a per-space setting because a dream run is scoped to exactly one
 * space. A person who does not want synthesis over their personal space turns it
 * off there and leaves it on everywhere else.
 */
export function SpaceDreaming({
  spaces,
  onToggle,
  onRun,
}: {
  spaces: readonly DreamingSpace[];
  onToggle: (spaceId: string, enabled: boolean) => Promise<ActionState<undefined>>;
  onRun: (spaceId: string, kind: DreamKind) => Promise<ActionState<undefined>>;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-sm font-medium text-foreground">Dreaming by space</h2>
      <p className="max-w-[var(--measure-prose)] text-sm text-foreground-lighter">
        A run reads one space and writes back into that space only. Switch it off for a space and
        nothing in that space is read overnight.
      </p>
      <div className="divide-y divide-border rounded-[var(--radius-panel)] border border-border">
        {spaces.map((space) => (
          <SpaceRow key={space.id} space={space} onToggle={onToggle} onRun={onRun} />
        ))}
      </div>
    </section>
  );
}
