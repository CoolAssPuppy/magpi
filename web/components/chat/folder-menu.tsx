'use client';

import { MoreHorizontal } from 'lucide-react';
import { useState, useTransition } from 'react';

import { deleteFolderAction, renameFolderAction } from '@/app/(app)/chat/actions';
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
import type { ConversationFolder } from '@/hooks/use-conversation-folders';

import { FolderFormDialog, type FolderDraft } from './folder-form-dialog';

type MenuDialog = 'closed' | 'rename' | 'delete';

type FolderMenuProps = {
  readonly folder: ConversationFolder;
  readonly onChanged: () => void;
};

export function FolderMenu({ folder, onChanged }: FolderMenuProps) {
  const [dialog, setDialog] = useState<MenuDialog>('closed');
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function rename(draft: FolderDraft) {
    startTransition(async () => {
      const state = await renameFolderAction({
        folderId: folder.id,
        name: draft.name,
        color: draft.color,
      });
      if (state.status === 'error') return setFailure(state.message);

      setDialog('closed');
      onChanged();
    });
  }

  function remove() {
    startTransition(async () => {
      const state = await deleteFolderAction({ folderId: folder.id });
      if (state.status === 'error') return setFailure(state.message);

      setDialog('closed');
      onChanged();
    });
  }

  function open(next: MenuDialog) {
    setFailure(null);
    setDialog(next);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={`Actions for folder ${folder.name}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => open('rename')}>Rename</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open('delete')}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <FolderFormDialog
        open={dialog === 'rename'}
        heading="Rename folder"
        submitLabel="Save"
        initial={{ name: folder.name, color: folder.color }}
        failure={failure}
        pending={pending}
        onOpenChange={(next) => setDialog(next ? 'rename' : 'closed')}
        onSubmit={rename}
      />

      <Dialog
        open={dialog === 'delete'}
        onOpenChange={(next) => setDialog(next ? 'delete' : 'closed')}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this folder</DialogTitle>
            <DialogDescription>
              The conversations in it are kept. They move to the top level of the sidebar.
            </DialogDescription>
          </DialogHeader>

          {failure ? (
            <p role="alert" className="text-sm text-destructive-600">
              {failure}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog('closed')}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
