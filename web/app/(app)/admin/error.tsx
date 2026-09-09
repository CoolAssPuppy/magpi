'use client';

import { BoundaryError } from '@/components/app/error-boundary';
import type { ErrorBoundaryProps } from '@/components/app/error-boundary-props';

export default function AdminError({ error, reset }: ErrorBoundaryProps) {
  return (
    <BoundaryError
      title="The analytics queries did not come back"
      detail="These panels read straight from the primary database. If this keeps happening, check the ingest jobs before you check the queries."
      error={error}
      reset={reset}
    />
  );
}
