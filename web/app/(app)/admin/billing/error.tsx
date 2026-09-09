'use client';

import { ErrorState } from '@/components/app/error-state';
import { Button } from '@/components/ui/button';

export default function BillingError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <ErrorState
        title="Billing did not load"
        detail="Nothing was charged. Your plan and your subscription are held by Stripe, so nothing here can have changed them."
      />
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
