'use client';

import { BoundaryError } from '@/components/app/error-boundary';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function DreamsError({ error, reset }: ErrorBoundaryProps) {
  return (
    <BoundaryError
      title="The dream runs could not be read"
      detail="No run was started or stopped by this. Try again in a moment."
      error={error}
      reset={reset}
    />
  );
}
