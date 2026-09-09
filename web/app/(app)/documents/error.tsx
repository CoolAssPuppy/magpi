'use client';

import { BoundaryError } from '@/components/app/error-boundary';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function DocumentsError({ error, reset }: ErrorBoundaryProps) {
  return (
    <BoundaryError
      title="Documents did not load"
      detail="Every document you have uploaded is still stored. This screen failed to list them."
      error={error}
      reset={reset}
    />
  );
}
