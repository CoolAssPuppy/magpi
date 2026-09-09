'use client';

import { ErrorState } from '@/components/app/error-state';
import { Button } from '@/components/ui/button';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function ConversationError({ reset }: ErrorBoundaryProps) {
  return (
    <div className="flex flex-col items-start gap-4">
      <ErrorState
        title="This conversation could not be loaded"
        detail="The questions and answers in it are still stored. Try again, or start a new conversation."
      />
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
