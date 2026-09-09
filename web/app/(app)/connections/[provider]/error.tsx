'use client';

import { BoundaryError } from '@/components/app/error-boundary';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function ProviderConnectError({ error, reset }: ErrorBoundaryProps) {
  return (
    <BoundaryError
      title="This source did not load"
      detail="Check the provider's status page if it keeps failing."
      error={error}
      reset={reset}
    />
  );
}
