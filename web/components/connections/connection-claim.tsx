'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import type { ActionState } from '@/lib/actions/state';

import { StatusPill } from '@/components/app/status-pill';

/** The last step of the OAuth flow: commits the parked ticket, then clears it from the URL. */
export function ConnectionClaim({
  provider,
  ticket,
  onClaim,
}: {
  provider: string;
  ticket: string;
  onClaim: (ticket: string) => Promise<ActionState<undefined>>;
}) {
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const claimed = useRef(false);

  useEffect(() => {
    if (claimed.current) return;
    claimed.current = true;

    void onClaim(ticket).then((result) => {
      if (result.status === 'error') setFailure(result.message);
      else router.replace(`/connections/${provider}`);
    });
  }, [onClaim, provider, router, ticket]);

  if (failure) {
    return (
      <div
        role="alert"
        className="rounded-[var(--radius-panel)] border border-border-destructive bg-destructive-200 px-4 py-3 text-sm text-destructive-600"
      >
        {failure} Start the connection again from this screen.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <StatusPill tone="progress" label="Finishing the connection" />
    </div>
  );
}
