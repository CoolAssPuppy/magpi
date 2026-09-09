'use client';

import { useEffect } from 'react';

import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';
import { ErrorState } from '@/components/app/error-state';
import { Button } from '@/components/ui/button';

/**
 * What every `error.tsx` renders. The copy is fixed and written for the screen
 * it belongs to, because in production Next replaces `error.message` with
 * generic digest text and any sentence built around it reads as nonsense.
 * The digest goes to the logs, which is the only place it is worth anything.
 */
export function BoundaryError({
  title,
  detail,
  error,
  reset,
}: ErrorBoundaryProps & { readonly title: string; readonly detail: string }) {
  useEffect(() => {
    console.error(title, error.digest ?? error.message);
  }, [title, error]);

  return (
    <div className="flex flex-col items-start gap-4">
      <ErrorState title={title} detail={detail} />
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
