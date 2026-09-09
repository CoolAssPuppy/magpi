'use client';

import { ErrorState } from '@/components/app/error-state';
import { Button } from '@/components/ui/button';

export default function MembersError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <ErrorState
        title="The member list did not load"
        detail="Nothing was changed. Try again, and if it keeps failing check whether your role in this organization changed."
      />
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
