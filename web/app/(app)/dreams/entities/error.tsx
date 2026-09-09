'use client';

import { ErrorState } from '@/components/app/error-state';
import { Button } from '@/components/ui/button';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function EntitiesError({ error, reset }: ErrorBoundaryProps) {
  return (
    <div className="flex flex-col items-start gap-3">
      <ErrorState title="The entities could not be read" detail={error.message} />
      <Button variant="outline" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
