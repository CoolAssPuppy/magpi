'use client';

import { BoundaryError } from '@/components/app/error-boundary';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function EntitiesError({ error, reset }: ErrorBoundaryProps) {
  return <BoundaryError title="Entities did not load" error={error} reset={reset} />;
}
