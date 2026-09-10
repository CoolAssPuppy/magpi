'use client';

import { useEffect } from 'react';

import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';
import { ErrorState } from '@/components/app/error-state';
import { Button } from '@/components/ui/button';

/** What every `error.tsx` renders. The copy is fixed; the digest goes to the logs. */
export function BoundaryError({
  title,
  detail,
  error,
  reset,
}: ErrorBoundaryProps & { readonly title: string; readonly detail?: string }) {
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
