import Link from 'next/link';
import type { ReactNode } from 'react';

import { HistorySidebar } from '@/components/chat/history-sidebar';
import { Button } from '@/components/ui/button';

/** The history rail is persistent navigation, so it sits outside the content area. */
export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 gap-8">
      <aside className="hidden w-64 shrink-0 flex-col gap-3 border-r border-border pr-4 lg:flex">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-sm font-medium text-foreground">Conversations</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/chat">New</Link>
          </Button>
        </div>
        <HistorySidebar />
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</section>
    </div>
  );
}
