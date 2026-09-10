'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import type { ActionState } from '@/lib/actions/state';

export type SpaceChoice = { readonly id: string; readonly name: string };

/** Authorize the account and go. Where each channel or folder lands is chosen on the row after. */
export function ConnectButton({
  providerSlug,
  displayName,
  hasConnection,
  onBegin,
}: {
  providerSlug: string;
  displayName: string;
  hasConnection: boolean;
  onBegin: (providerSlug: string) => Promise<ActionState<undefined>>;
}) {
  const [failure, setFailure] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const begin = () => {
    setFailure(null);
    startTransition(async () => {
      const result = await onBegin(providerSlug);
      if (result.status === 'error') setFailure(result.message);
    });
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        variant="outline"
        size="sm"
        className="w-28"
        disabled={isPending}
        aria-label={hasConnection ? `Add another ${displayName}` : `Connect ${displayName}`}
        onClick={begin}
      >
        {hasConnection ? 'Add another' : 'Connect'}
      </Button>

      {failure ? (
        <p role="alert" className="text-sm text-destructive-600">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
