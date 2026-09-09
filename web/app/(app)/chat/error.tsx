'use client';

import { ErrorState } from '@/components/app/error-state';
import { Button } from '@/components/ui/button';

export default function ChatError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-4">
      <ErrorState
        title="Chat could not be opened"
        detail="Your conversations are safe. This screen failed to load them."
      />
      <Button variant="outline" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
