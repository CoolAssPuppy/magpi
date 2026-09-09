'use client';

import { ErrorState } from '@/components/app/error-state';

export default function DocumentsError({ error }: { error: Error }) {
  return <ErrorState title="Documents did not load" detail={error.message} />;
}
