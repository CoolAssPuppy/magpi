'use client';

import { BoundaryError } from '@/components/app/error-boundary';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function SearchesError({ error, reset }: ErrorBoundaryProps) {
  return (
    <BoundaryError
      title="Search analytics did not load"
      detail="Reload to try again."
      error={error}
      reset={reset}
    />
  );
}
