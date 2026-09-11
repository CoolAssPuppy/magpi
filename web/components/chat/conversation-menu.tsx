'use client';

import { MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  deleteConversationAction,
  moveConversationAction,
  renameConversationAction,
} from '@/app/(app)/chat/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ConversationFolder } from '@/hooks/use-conversation-folders';

type MenuDialog = 'closed' | 'rename' | 'move' | 'delete';

/** Radix Select has no empty value, so the top level of the sidebar is a sentinel. */
const TOP_LEVEL = 'top-level';

type ConversationMenuProps = {
  readonly conversationId: string;
  readonly title: string;
  readonly folderId: string | null;
  readonly folders: readonly ConversationFolder[];
  readonly onMoved: () => void;
};

export function ConversationMenu({
  conversationId,
  title,
  folderId,
  folders,
  onMoved,
}: ConversationMenuProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<MenuDialog>('closed');
  const [draft, setDraft] = useState(title);
  const [destination, setDestination] = useState(folderId ?? TOP_LEVEL);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function rename() {
    startTransition(async () => {
      const state = await renameConversationAction({ conversationId, title: draft });
      if (state.status === 'error') return setFailure(state.message);

      setDialog('closed');
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const state = await deleteConversationAction({ conversationId });
      if (state.status === 'error') return setFailure(state.message);

      setDialog('closed');
      router.push('/chat');
      router.refresh();
    });
  }

  function move() {
    startTransition(async () => {
      const state = await moveConversationAction({
        conversationId,
        folderId: destination === TOP_LEVEL ? null : destination,
      });
      if (state.status === 'error') return setFailure(state.message);

      setDialog('closed');
      onMoved();
    });
  }

  function open(next: MenuDialog) {
    setFailure(null);
    setDraft(title);
    setDestination(folderId ?? TOP_LEVEL);
    setDialog(next);
  }

  function primaryAction() {
    if (dialog === 'delete') {
      return (
        <Button variant="destructive" onClick={remove} disabled={pending}>
          Delete
        </Button>
      );
    }
    if (dialog === 'move') {
      return (
        <Button onClick={move} disabled={pending}>
          Move
        </Button>
      );
    }
    return (
      <Button onClick={rename} disabled={pending || draft.trim() === ''}>
        Save
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={`Actions for ${title}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => open('rename')}>Rename</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open('move')}>Move to folder</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open('delete')}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog !== 'closed'} onOpenChange={() => setDialog('closed')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{headingFor(dialog)}</DialogTitle>
            {dialog === 'delete' ? (
              <DialogDescription>
                This deletes the questions and answers in this conversation.
              </DialogDescription>
            ) : null}
          </DialogHeader>

          {dialog === 'rename' ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="conversation-title">Name</Label>
              <Input
                id="conversation-title"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={120}
              />
            </div>
          ) : null}

          {dialog === 'move' ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="conversation-folder">Folder</Label>
              <Select value={destination} onValueChange={setDestination}>
                <SelectTrigger id="conversation-folder" aria-label="Folder">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TOP_LEVEL}>No folder</SelectItem>
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {failure ? (
            <p role="alert" className="text-sm text-destructive-600">
              {failure}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog('closed')}>
              Cancel
            </Button>
            {primaryAction()}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function headingFor(dialog: MenuDialog): string {
  if (dialog === 'delete') return 'Delete this conversation';
  if (dialog === 'move') return 'Move to folder';
  return 'Rename conversation';
}
