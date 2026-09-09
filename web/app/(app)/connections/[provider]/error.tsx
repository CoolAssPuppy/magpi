'use client';

import { BoundaryError } from '@/components/app/error-boundary';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function ProviderConnectError({ error, reset }: ErrorBoundaryProps) {
  return (
    <BoundaryError
      title="This source could not be loaded"
      detail={
        "Nothing was connected or disconnected. Try again, and check the source's own status page if it keeps failing."
      }
      error={error}
      reset={reset}
    />
  );
}
