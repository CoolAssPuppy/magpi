'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useInfiniteQuery, type SupabaseTableData } from '@/hooks/use-infinite-query';
import { cn } from '@/lib/utils';

import { ConversationMenu } from './conversation-menu';

type ConversationRow = SupabaseTableData<'conversations'>;

export function HistorySidebar() {
  const pathname = usePathname();
  const { data, isLoading, error, hasMore, fetchNextPage } = useInfiniteQuery<
    ConversationRow,
    'conversations'
  >({
    tableName: 'conversations',
    pageSize: 20,
    trailingQuery: (query) => query.order('updated_at', { ascending: false }),
  });

  if (isLoading) return <SidebarNote>Loading your conversations...</SidebarNote>;
  if (error) return <SidebarNote>Your conversations could not be loaded.</SidebarNote>;
  if (data.length === 0) return <SidebarNote>Nothing asked yet.</SidebarNote>;

  return (
    <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
      <ul className="flex flex-col">
        {data.map((conversation) => {
          const href = `/chat/${conversation.id}`;
          const isOpen = pathname === href;

          return (
            <li key={conversation.id} className="group flex items-center gap-1">
              <Link
                href={href}
                aria-current={isOpen ? 'page' : undefined}
                className={cn(
                  'min-w-0 flex-1 truncate rounded-[var(--radius-panel)] px-2 py-1.5 text-sm transition-colors motion-reduce:transition-none',
                  isOpen
                    ? 'bg-background-surface-200 text-foreground'
                    : 'text-foreground-light hover:bg-background-surface-100 hover:text-foreground',
                )}
              >
                {conversation.title ?? 'Untitled conversation'}
              </Link>
              <ConversationMenu
                conversationId={conversation.id}
                title={conversation.title ?? 'Untitled conversation'}
              />
            </li>
          );
        })}
      </ul>

      {hasMore ? (
        <button
          type="button"
          onClick={() => void fetchNextPage()}
          className="self-start px-2 py-1 text-xs text-foreground-lighter hover:text-foreground"
        >
          Show older
        </button>
      ) : null}
    </div>
  );
}

function SidebarNote({ children }: { children: string }) {
  return <p className="px-2 text-sm text-foreground-lighter">{children}</p>;
}
