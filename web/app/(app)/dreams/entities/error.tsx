'use client';

import { BoundaryError } from '@/components/app/error-boundary';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function EntitiesError({ error, reset }: ErrorBoundaryProps) {
  return (
    <BoundaryError
      title="The entities could not be read"
      detail="Nothing was changed by this. Try again, and check the most recent dream run if it keeps failing."
      error={error}
      reset={reset}
    />
  );
}
