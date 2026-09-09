'use client';

import { BoundaryError } from '@/components/app/error-boundary';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function ChatError({ error, reset }: ErrorBoundaryProps) {
  return (
    <BoundaryError
      title="Chat could not be opened"
      detail="Your conversations are safe. This screen failed to load them."
      error={error}
      reset={reset}
    />
  );
}
