'use client';

import { BoundaryError } from '@/components/app/error-boundary';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function DreamRunError({ error, reset }: ErrorBoundaryProps) {
  return <BoundaryError title="This run did not load" error={error} reset={reset} />;
}
