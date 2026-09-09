'use client';

import { BoundaryError } from '@/components/app/error-boundary';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function MembersError({ error, reset }: ErrorBoundaryProps) {
  return (
    <BoundaryError
      title="The member list did not load"
      detail="Nothing was changed. Try again, and if it keeps failing check whether your role in this organization changed."
      error={error}
      reset={reset}
    />
  );
}
