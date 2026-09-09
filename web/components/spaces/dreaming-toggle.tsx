'use client';

import { useTransition } from 'react';

import { setDreaming } from '@/app/(app)/spaces/actions';
import { Switch } from '@/components/ui/switch';

/**
 * Dreaming is defined here rather than assumed, because it is the first place
 * many users meet the word.
 */
export function DreamingToggle({ spaceId, enabled }: { spaceId: string; enabled: boolean }) {
  const [isPending, startTransition] = useTransition();

  function toggle(next: boolean) {
    const formData = new FormData();
    formData.set('spaceId', spaceId);
    formData.set('enabled', String(next));
    // Awaited inside the transition, so isPending stays true for as long as the
    // write does. A synchronous callback ends the transition immediately and
    // leaves the switch live for a second click the first has not answered yet.
    startTransition(async () => {
      await setDreaming(formData);
    });
  }

  return (
    <div className="flex items-start justify-between gap-6 rounded-[var(--radius-panel)] border border-border p-4">
      <div className="max-w-[var(--measure-prose)]">
        <h2 className="font-heading text-sm font-medium text-foreground">Dreaming</h2>
        <p className="mt-1 text-sm text-tertiary-foreground">
          Once a night Magpi re-reads what came into this space that day, extracts the people and
          projects it mentions, links documents that are about the same thing, and writes a digest
          back into the space. Everything it writes cites its sources.
        </p>
      </div>

      <Switch
        checked={enabled}
        disabled={isPending}
        onCheckedChange={toggle}
        aria-label="Dream over this space overnight"
      />
    </div>
  );
}
