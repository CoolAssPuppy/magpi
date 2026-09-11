'use client';

import { useCallback, useState, useTransition } from 'react';

import { moveConversationAction } from '@/app/(app)/chat/actions';
import { draggedConversation } from '@/lib/chat/drag';

/**
 * One drop target: a folder, or the top level when `folderId` is null. A conversation dropped on
 * the place it is already filed is left alone rather than written again.
 */
export function useFolderDrop(folderId: string | null, onMoved: () => void) {
  const [isOver, setIsOver] = useState(false);
  const [, startTransition] = useTransition();

  const onDragOver = useCallback((event: React.DragEvent) => {
    // Without this the browser refuses the drop and the row springs back.
    event.preventDefault();
    // A folder sits inside the list, which is also a target. The innermost one wins, or a drop
    // into a folder would file it and then immediately unfile it on the way up.
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setIsOver(true);
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent) => {
    event.stopPropagation();
    setIsOver(false);
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsOver(false);

      const dragged = draggedConversation(event.dataTransfer);
      if (!dragged || dragged.folderId === folderId) return;

      startTransition(async () => {
        const state = await moveConversationAction({ conversationId: dragged.id, folderId });
        if (state.status !== 'error') onMoved();
      });
    },
    [folderId, onMoved],
  );

  return { isOver, dropProps: { onDragOver, onDragLeave, onDrop } };
}
