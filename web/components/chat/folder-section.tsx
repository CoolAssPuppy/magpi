'use client';

import type { ConversationFolder } from '@/hooks/use-conversation-folders';
import { swatchFor } from '@/lib/chat/folder-colors';
import { cn } from '@/lib/utils';

import { ConversationList, type SidebarConversation } from './conversation-list';
import { FolderMenu } from './folder-menu';
import { useFolderDrop } from './use-folder-drop';

type FolderSectionProps = {
  readonly folder: ConversationFolder;
  readonly folders: readonly ConversationFolder[];
  readonly conversations: readonly SidebarConversation[];
  readonly onChanged: () => void;
};

/** One folder and what is filed in it. A folder holding nothing still shows. */
export function FolderSection({ folder, folders, conversations, onChanged }: FolderSectionProps) {
  const { isOver, dropProps } = useFolderDrop(folder.id, onChanged);

  return (
    <section
      aria-label={folder.name}
      {...dropProps}
      className={cn(
        'flex flex-col rounded-[var(--radius-panel)] transition-colors motion-reduce:transition-none',
        isOver && 'bg-muted ring-1 ring-brand',
      )}
    >
      <div className="group flex items-center gap-2 px-2 py-1">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: swatchFor(folder.color) }}
          aria-hidden="true"
        />
        <h3 className="min-w-0 flex-1 truncate text-xs font-medium text-tertiary-foreground">
          {folder.name}
        </h3>
        <FolderMenu folder={folder} onChanged={onChanged} />
      </div>

      {conversations.length === 0 ? (
        <p className="px-2 pb-1 text-xs text-tertiary-foreground">Nothing filed here yet.</p>
      ) : (
        <ConversationList conversations={conversations} folders={folders} onMoved={onChanged} />
      )}
    </section>
  );
}
