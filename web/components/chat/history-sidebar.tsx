'use client';

import { useCallback, useState } from 'react';

import { useConversationFolders } from '@/hooks/use-conversation-folders';
import { useInfiniteQuery, type SupabaseTableData } from '@/hooks/use-infinite-query';

import { ConversationList } from './conversation-list';
import { FolderSection } from './folder-section';
import { NewFolderButton } from './new-folder-button';

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

  if (isLoading) return <SidebarNote>Loading your conversations...</SidebarNote>;
  if (error) return <SidebarNote>Your conversations could not be loaded.</SidebarNote>;

  const filed = groupByFolder(data, folders);

  return (
    <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
      <NewFolderButton onCreated={refresh} />

      {folderError ? <SidebarNote>Your folders could not be loaded.</SidebarNote> : null}
      {data.length === 0 && folders.length === 0 ? (
        <SidebarNote>Nothing asked yet.</SidebarNote>
      ) : null}

      {folders.map((folder) => (
        <FolderSection
          key={folder.id}
          folder={folder}
          folders={folders}
          conversations={filed.byFolder.get(folder.id) ?? []}
          onChanged={refresh}
        />
      ))}

      <ConversationList conversations={filed.unfiled} folders={folders} onMoved={refresh} />

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
  );
}

// A conversation filed in a folder this person can no longer see sits at the top level instead.
function groupByFolder(
  conversations: readonly ConversationRow[],
  folders: readonly { readonly id: string }[],
) {
  const byFolder = new Map<string, ConversationRow[]>(folders.map((folder) => [folder.id, []]));
  const unfiled: ConversationRow[] = [];

  for (const conversation of conversations) {
    const bucket =
      conversation.folder_id === null ? undefined : byFolder.get(conversation.folder_id);
    if (bucket) bucket.push(conversation);
    else unfiled.push(conversation);
  }

  return { byFolder, unfiled };
}

function SidebarNote({ children }: { children: string }) {
  return <p className="px-2 text-sm text-tertiary-foreground">{children}</p>;
}
