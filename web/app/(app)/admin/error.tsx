'use client';

import { ErrorState } from '@/components/app/error-state';
import { Button } from '@/components/ui/button';

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <ErrorState
        title="The analytics queries did not come back"
        detail="These panels read straight from the primary database. If this keeps happening, check the ingest jobs before you check the queries."
      />
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
