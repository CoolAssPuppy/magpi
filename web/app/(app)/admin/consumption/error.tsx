'use client';

import { BoundaryError } from '@/components/app/error-boundary';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function ConsumptionError({ error, reset }: ErrorBoundaryProps) {
  return (
    <BoundaryError
      title="Usage did not load"
      detail="Reload to try again."
      error={error}
      reset={reset}
    />
  );
}
