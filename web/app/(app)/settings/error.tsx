'use client';

import { BoundaryError } from '@/components/app/error-boundary';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function SettingsError({ error, reset }: ErrorBoundaryProps) {
  return <BoundaryError title="Settings did not load" error={error} reset={reset} />;
}
