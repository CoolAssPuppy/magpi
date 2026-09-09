'use client';

import { ErrorState } from '@/components/app/error-state';
import { Button } from '@/components/ui/button';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function ChatError({ reset }: ErrorBoundaryProps) {
  return (
    <div className="flex flex-col items-start gap-4">
      <ErrorState
        title="Chat could not be opened"
        detail="Your conversations are safe. This screen failed to load them."
      />
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
