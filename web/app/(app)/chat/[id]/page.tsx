import { notFound, redirect } from 'next/navigation';

import { ConversationView } from '@/components/chat/conversation-view';
import { toChatTurns } from '@/lib/chat/history';
import { loadConversation, loadMessages } from '@/lib/chat/store';
import { getSessionContext } from '@/lib/supabase/context';

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ask?: string }>;
}) {
  const [{ id }, { ask }] = await Promise.all([params, searchParams]);

  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const conversation = await loadConversation(context.supabase, id);
  if (!conversation) notFound();

  const turns = await toChatTurns(context.supabase, await loadMessages(context.supabase, id));

  return (
    <ConversationView
      conversationId={conversation.id}
      initialTurns={turns}
      initialTitle={conversation.title}
      pendingQuestion={ask ?? null}
    />
  );
}
