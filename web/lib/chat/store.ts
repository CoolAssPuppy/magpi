import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json } from '@/lib/database.types';

import type { ConversationTurn } from './condense';

export type ConversationRecord = {
  readonly id: string;
  readonly spaceFilter: readonly string[] | null;
  readonly title: string | null;
};

export type StoredMessage = {
  readonly id: string;
  readonly role: Database['public']['Enums']['message_role'];
  readonly content: string;
  readonly citations: Json;
  readonly createdAt: string;
};

export type AssistantMessageInput = {
  readonly conversationId: string;
  readonly content: string;
  readonly citations: readonly string[];
  readonly latencyMs: number;
  readonly tokenCount: number;
};

export type ConversationStore = {
  readonly addUserMessage: (input: { conversationId: string; content: string }) => Promise<string>;
  readonly addAssistantMessage: (input: AssistantMessageInput) => Promise<string>;
  readonly setCondensedQuery: (messageId: string, text: string) => Promise<void>;
  readonly setTitle: (conversationId: string, title: string) => Promise<void>;
};

type Client = SupabaseClient<Database>;

/**
 * Every write goes through the reader's own client. A conversation that is not
 * theirs is not writable, and row level security is the thing that says so.
 */
export function createConversationStore(supabase: Client): ConversationStore {
  return {
    addUserMessage: async ({ conversationId, content }) => {
      const { data, error } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, role: 'user', content })
        .select('id')
        .single();

      if (error) throw new Error(error.message);
      return data.id;
    },

    addAssistantMessage: async (input) => {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: input.conversationId,
          role: 'assistant',
          content: input.content,
          citations: [...input.citations],
          latency_ms: input.latencyMs,
          token_count: input.tokenCount,
        })
        .select('id')
        .single();

      if (error) throw new Error(error.message);
      return data.id;
    },

    setCondensedQuery: async (messageId, text) => {
      const { error } = await supabase
        .from('messages')
        .update({ condensed_query: text })
        .eq('id', messageId);

      if (error) throw new Error(error.message);
    },

    setTitle: async (conversationId, title) => {
      const { error } = await supabase
        .from('conversations')
        .update({ title })
        .eq('id', conversationId);

      if (error) throw new Error(error.message);
    },
  };
}

export async function loadConversation(
  supabase: Client,
  conversationId: string,
): Promise<ConversationRecord | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, space_filter, title')
    .eq('id', conversationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return { id: data.id, spaceFilter: data.space_filter, title: data.title };
}

/**
 * How many messages one read takes when the caller names no number of its own.
 * A conversation has no upper bound and nothing reads all of it: a screen shows
 * the end of it, and the answer path uses the last PROMPT_HISTORY_TURNS.
 */
export const CONVERSATION_WINDOW = 200;

export async function loadMessages(
  supabase: Client,
  conversationId: string,
  options: { limit?: number } = {},
): Promise<readonly StoredMessage[]> {
  // Newest first is what puts the window on the end of the conversation, which
  // is the end everything here cares about. The reverse hands it back in
  // reading order, which is the order a prompt and a screen both want.
  const { data, error } = await supabase
    .from('messages')
    .select('id, role, content, citations, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? CONVERSATION_WINDOW);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      citations: row.citations,
      createdAt: row.created_at,
    }))
    .reverse();
}

export function toTurns(messages: readonly StoredMessage[]): readonly ConversationTurn[] {
  return messages.map((message) => ({ role: message.role, content: message.content }));
}
