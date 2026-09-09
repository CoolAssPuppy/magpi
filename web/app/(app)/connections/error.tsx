'use client';

import { BoundaryError } from '@/components/app/error-boundary';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function ConnectionsError({ error, reset }: ErrorBoundaryProps) {
  return (
    <BoundaryError
      title="The connections could not be read"
      detail="Your sources are still connected. This screen failed to list them."
      error={error}
      reset={reset}
    />
  );
}
