/** Dragging a conversation onto a folder. The menu on each row does the same move by keyboard. */

/** Our own type, so a file or a link dragged in from elsewhere is not read as a conversation. */
export const CONVERSATION_MIME = 'application/x-magpi-conversation';

export interface DraggedConversation {
  id: string;
  /** Where it is filed now, so a drop onto that same place can be left alone. */
  folderId: string | null;
}

export function startConversationDrag(
  transfer: DataTransfer,
  conversation: DraggedConversation,
): void {
  transfer.setData(CONVERSATION_MIME, JSON.stringify(conversation));
  transfer.effectAllowed = 'move';
}

/** What is being dragged, or null when whatever is over the target is not one of ours. */
export function draggedConversation(transfer: DataTransfer | null): DraggedConversation | null {
  const raw = transfer?.getData(CONVERSATION_MIME);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const { id, folderId } = parsed as Record<string, unknown>;
    if (typeof id !== 'string' || id.length === 0) return null;
    return { id, folderId: typeof folderId === 'string' ? folderId : null };
  } catch {
    return null;
  }
}
