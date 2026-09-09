'use client';

import { BoundaryError } from '@/components/app/error-boundary';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function DreamRunError({ error, reset }: ErrorBoundaryProps) {
  return (
    <BoundaryError
      title="This run could not be read"
      detail="The run and everything it wrote are untouched. Try again in a moment."
      error={error}
      reset={reset}
    />
  );
}
