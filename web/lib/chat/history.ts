import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

import { resolveCitationSets } from './citations';
import type { StoredMessage } from './store';
import type { ChatTurn } from './turns';

/** Turns a stored conversation into what the screen renders, resolving citations in one query. */
export async function toChatTurns(
  supabase: SupabaseClient<Database>,
  messages: readonly StoredMessage[],
): Promise<readonly ChatTurn[]> {
  const answers = messages.filter((message) => message.role === 'assistant');
  const citationSets = await resolveCitationSets(
    supabase,
    answers.map((message) => message.citations),
  );

  const byMessageId = new Map(answers.map((message, index) => [message.id, citationSets[index]]));

  return messages.map((message) =>
    message.role === 'user'
      ? { kind: 'question', id: message.id, content: message.content }
      : {
          kind: 'answer',
          id: message.id,
          content: message.content,
          citations: byMessageId.get(message.id) ?? [],
          streaming: false,
        },
  );
}
