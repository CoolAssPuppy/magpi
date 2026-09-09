'use client';

import { MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { deleteConversationAction, renameConversationAction } from '@/app/(app)/chat/actions';
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

type MenuDialog = 'closed' | 'rename' | 'delete';

export type ConversationMenuProps = {
  readonly conversationId: string;
  readonly title: string;
};

export function ConversationMenu({ conversationId, title }: ConversationMenuProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<MenuDialog>('closed');
  const [draft, setDraft] = useState(title);
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

  function open(next: MenuDialog) {
    setFailure(null);
    setDraft(title);
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
            aria-label={`Actions for ${title}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => open('rename')}>Rename</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open('delete')}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={dialog !== 'closed'}
        onOpenChange={(next) => setDialog(next ? dialog : 'closed')}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === 'delete' ? 'Delete this conversation' : 'Rename conversation'}
            </DialogTitle>
            {dialog === 'delete' ? (
              <DialogDescription>
                The questions and answers in it go with it. Documents are untouched.
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

          {failure ? (
            <p role="alert" className="text-sm text-destructive-600">
              {failure}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog('closed')}>
              Cancel
            </Button>
            {dialog === 'delete' ? (
              <Button variant="destructive" onClick={remove} disabled={pending}>
                Delete
              </Button>
            ) : (
              <Button onClick={rename} disabled={pending || draft.trim() === ''}>
                Save
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
