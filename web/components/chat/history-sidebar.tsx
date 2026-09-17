'use client';

import { useCallback, useState } from 'react';

import { useConversationFolders, type ConversationFolder } from '@/hooks/use-conversation-folders';
import { useInfiniteQuery, type SupabaseTableData } from '@/hooks/use-infinite-query';

import { cn } from '@/lib/utils';

import { ConversationList } from './conversation-list';
import { FolderSection } from './folder-section';
import { NewFolderButton } from './new-folder-button';
import { useFolderDrop } from './use-folder-drop';

type ConversationRow = SupabaseTableData<'conversations'>;

export function HistorySidebar() {
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  const { folders, error: folderError } = useConversationFolders(reloadKey);
  const { data, isLoading, error, hasMore, fetchNextPage } = useInfiniteQuery<
    ConversationRow,
    'conversations'
  >({
    tableName: 'conversations',
    pageSize: 20,
    trailingQuery: (query) => query.order('updated_at', { ascending: false }),
    trailingQueryKey: reloadKey,
  });

  // Hooks run before the early returns below, because a loading rail still has to be a rail.
  const { isOver, dropProps } = useFolderDrop(null, refresh);

  if (isLoading) return <SidebarNote>Loading your conversations...</SidebarNote>;
  if (error) return <SidebarNote>Your conversations could not be loaded.</SidebarNote>;

  const { sections, unfiled } = groupByFolder(data, folders);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* Everything scrolls except the button, which stays where it can always be reached. */}
      <div
        // Named because it is also the drop target for taking a chat out of a folder.
        aria-label="Conversations"
        {...dropProps}
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-[var(--radius-panel)] transition-colors motion-reduce:transition-none',
          isOver && 'bg-muted',
        )}
      >
        {folderError ? <SidebarNote>Your folders could not be loaded.</SidebarNote> : null}
        {data.length === 0 && folders.length === 0 ? (
          <SidebarNote>Nothing asked yet.</SidebarNote>
        ) : null}

        {sections.map((section) => (
          <FolderSection
            key={section.folder.id}
            folder={section.folder}
            folders={folders}
            conversations={section.conversations}
            onChanged={refresh}
          />
        ))}

        <ConversationList conversations={unfiled} folders={folders} onChanged={refresh} />

        {hasMore ? (
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            className="self-start px-2 py-1 text-xs text-tertiary-foreground hover:text-foreground"
          >
            Show older
          </button>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-border pt-2">
        <NewFolderButton onCreated={refresh} />
      </div>
    </div>
  );
}

type FolderGroup = {
  readonly folder: ConversationFolder;
  readonly conversations: ConversationRow[];
};

// A conversation filed in a folder this person can no longer see sits at the top level instead.
function groupByFolder(
  conversations: readonly ConversationRow[],
  folders: readonly ConversationFolder[],
) {
  const sections: FolderGroup[] = folders.map((folder) => ({ folder, conversations: [] }));
  const byFolder = new Map(sections.map((section) => [section.folder.id, section.conversations]));
  const unfiled: ConversationRow[] = [];

  for (const conversation of conversations) {
    const bucket =
      conversation.folder_id === null ? undefined : byFolder.get(conversation.folder_id);
    if (bucket) bucket.push(conversation);
    else unfiled.push(conversation);
  }

  return { sections, unfiled };
}

function SidebarNote({ children }: { children: string }) {
  return <p className="px-2 text-sm text-tertiary-foreground">{children}</p>;
}
