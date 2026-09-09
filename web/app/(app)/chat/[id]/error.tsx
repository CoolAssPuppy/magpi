'use client';

import { BoundaryError } from '@/components/app/error-boundary';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function ConversationError({ error, reset }: ErrorBoundaryProps) {
  return <BoundaryError title="This conversation did not load" error={error} reset={reset} />;
}
