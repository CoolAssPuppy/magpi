'use client';

import { BoundaryError } from '@/components/app/error-boundary';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function SpacesError({ error, reset }: ErrorBoundaryProps) {
  return (
    <BoundaryError
      title="Spaces did not load"
      detail="Your spaces and everything in them are untouched. This screen failed to list them."
      error={error}
      reset={reset}
    />
  );
}
