'use client';

import { BoundaryError } from '@/components/app/error-boundary';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function AdminError({ error, reset }: ErrorBoundaryProps) {
  return <BoundaryError title="Analytics did not load" error={error} reset={reset} />;
}
