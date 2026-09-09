import Link from 'next/link';

import { EmptyState } from '@/components/app/empty-state';
import { Button } from '@/components/ui/button';

export default function ConversationNotFound() {
  return (
    <EmptyState
      title="That conversation is not here"
      description="It was deleted, or it belongs to someone else. Your other conversations are in the rail on the left."
      action={
        <Button asChild size="sm">
          <Link href="/chat">Ask something new</Link>
        </Button>
      }
    />
  );
}
