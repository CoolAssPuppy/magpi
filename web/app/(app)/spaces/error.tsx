'use client';

import { ErrorState } from '@/components/app/error-state';

export default function SpacesError({ error }: { error: Error }) {
  return <ErrorState title="Spaces did not load" detail={error.message} />;
}
