'use client';

import { BoundaryError } from '@/components/app/error-boundary';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function ConversationError({ error, reset }: ErrorBoundaryProps) {
  return (
    <BoundaryError
      title="This conversation could not be loaded"
      detail="The questions and answers in it are still stored. Try again, or start a new conversation."
      error={error}
      reset={reset}
    />
  );
}
