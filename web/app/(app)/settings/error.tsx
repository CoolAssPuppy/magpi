'use client';

import { ErrorState } from '@/components/app/error-state';
import { Button } from '@/components/ui/button';

export default function SettingsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <ErrorState
        title="Settings did not load"
        detail="Nothing was changed. Try again, and sign out and back in if it keeps happening."
      />
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
