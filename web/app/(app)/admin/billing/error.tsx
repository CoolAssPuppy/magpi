'use client';

import { BoundaryError } from '@/components/app/error-boundary';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function BillingError({ error, reset }: ErrorBoundaryProps) {
  return (
    <BoundaryError
      title="Billing did not load"
      detail="Nothing was charged. Your plan and your subscription are held by Stripe, so nothing here can have changed them."
      error={error}
      reset={reset}
    />
  );
}
