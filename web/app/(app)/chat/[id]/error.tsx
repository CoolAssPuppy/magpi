'use client';

import { ErrorState } from '@/components/app/error-state';
import { Button } from '@/components/ui/button';

export default function ConversationError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-4">
      <ErrorState
        title="This conversation could not be loaded"
        detail="The questions and answers in it are still stored. Try again, or start a new conversation."
      />
      <Button variant="outline" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
