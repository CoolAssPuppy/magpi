'use client';

import { BoundaryError } from '@/components/app/error-boundary';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function MembersError({ error, reset }: ErrorBoundaryProps) {
  return (
    <BoundaryError
      title="Members did not load"
      detail="Ask an owner whether your role changed."
      error={error}
      reset={reset}
    />
  );
}
