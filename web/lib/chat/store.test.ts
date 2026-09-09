import { describe, expect, it } from 'vitest';

import {
  CONVERSATION_WINDOW,
  createConversationStore,
  loadConversation,
  loadMessages,
  toTurns,
  type StoredMessage,
} from './store';
import { recordingClient } from './test-support';

const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';
const MESSAGE_ID = '55555555-5555-4555-8555-555555555555';
const CHUNK_ID = '11111111-1111-4111-8111-111111111111';

const storedMessage = (overrides: Partial<StoredMessage> = {}): StoredMessage => ({
  id: MESSAGE_ID,
  role: 'user',
  content: 'What is blocking SSO?',
  citations: [],
  createdAt: '2026-09-09T10:00:00Z',
  ...overrides,
});

describe('createConversationStore', () => {
  it('writes the question as a user message and returns its id', async () => {
    const { supabase, writes } = recordingClient({ single: { id: MESSAGE_ID } });

    const id = await createConversationStore(supabase).addUserMessage({
      conversationId: CONVERSATION_ID,
      content: 'What is blocking SSO?',
    });

    expect(id).toBe(MESSAGE_ID);
    expect(writes[0]).toEqual({
      table: 'messages',
      operation: 'insert',
      values: {
        conversation_id: CONVERSATION_ID,
        role: 'user',
        content: 'What is blocking SSO?',
      },
    });
  });

  it('writes the chunk ids, latency and token count on the answer', async () => {
    const { supabase, writes } = recordingClient({ single: { id: MESSAGE_ID } });

    await createConversationStore(supabase).addAssistantMessage({
      conversationId: CONVERSATION_ID,
      content: 'Blocked on ENG-4417 [1].',
      citations: [CHUNK_ID],
      latencyMs: 1840,
      tokenCount: 312,
    });

    expect(writes[0].values).toEqual({
      conversation_id: CONVERSATION_ID,
      role: 'assistant',
      content: 'Blocked on ENG-4417 [1].',
      citations: [CHUNK_ID],
      latency_ms: 1840,
      token_count: 312,
    });
  });

  it('keeps the rewrite on the message it rewrote', async () => {
    const { supabase, writes } = recordingClient({});

    await createConversationStore(supabase).setCondensedQuery(MESSAGE_ID, 'standalone question');

    expect(writes[0]).toEqual({
      table: 'messages',
      operation: 'update',
      values: { condensed_query: 'standalone question' },
      match: ['id', MESSAGE_ID],
    });
  });

  it('names the conversation', async () => {
    const { supabase, writes } = recordingClient({});

    await createConversationStore(supabase).setTitle(CONVERSATION_ID, 'SSO blockers');

    expect(writes[0]).toEqual({
      table: 'conversations',
      operation: 'update',
      values: { title: 'SSO blockers' },
      match: ['id', CONVERSATION_ID],
    });
  });

  it('surfaces a refused write rather than pretending it landed', async () => {
    const { supabase } = recordingClient({
      error: { message: 'new row violates row-level security' },
    });

    await expect(
      createConversationStore(supabase).addUserMessage({
        conversationId: CONVERSATION_ID,
        content: 'hello',
      }),
    ).rejects.toThrow('new row violates row-level security');
  });
});

describe('loadConversation', () => {
  it('reads the conversation and its space filter', async () => {
    const { supabase } = recordingClient({
      maybeSingle: { id: CONVERSATION_ID, space_filter: ['space-1'], title: 'SSO blockers' },
    });

    expect(await loadConversation(supabase, CONVERSATION_ID)).toEqual({
      id: CONVERSATION_ID,
      spaceFilter: ['space-1'],
      title: 'SSO blockers',
    });
  });

  it('answers null for a conversation the reader cannot see', async () => {
    const { supabase } = recordingClient({ maybeSingle: null });

    expect(await loadConversation(supabase, CONVERSATION_ID)).toBeNull();
  });
});

describe('loadMessages', () => {
  it('hands the turns back oldest first, though it reads the newest end of the conversation', async () => {
    const { supabase, reads } = recordingClient({
      rows: [
        toRow(
          storedMessage({
            role: 'assistant',
            content: 'Blocked on ENG-4417 [1].',
            createdAt: '2026-09-09T10:01:00Z',
          }),
        ),
        toRow(storedMessage({ createdAt: '2026-09-09T10:00:00Z' })),
      ],
    });

    const messages = await loadMessages(supabase, CONVERSATION_ID);

    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(reads[0]).toMatchObject({ table: 'messages', order: ['created_at', false] });
  });

  it('reads a window off the end of the conversation rather than every message in it', async () => {
    const { supabase, reads } = recordingClient({ rows: [] });

    await loadMessages(supabase, CONVERSATION_ID);

    expect(reads[0]).toMatchObject({ limit: CONVERSATION_WINDOW });
  });

  it('reads only the few turns the answer path asks for', async () => {
    const { supabase, reads } = recordingClient({ rows: [] });

    await loadMessages(supabase, CONVERSATION_ID, { limit: 8 });

    expect(reads[0]).toMatchObject({ limit: 8 });
  });
});

describe('toTurns', () => {
  it('reduces stored messages to what a prompt needs', () => {
    const turns = toTurns([
      storedMessage(),
      storedMessage({ role: 'assistant', content: 'Answer' }),
    ]);

    expect(turns).toEqual([
      { role: 'user', content: 'What is blocking SSO?' },
      { role: 'assistant', content: 'Answer' },
    ]);
  });
});

function toRow(message: StoredMessage) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    citations: message.citations,
    created_at: message.createdAt,
  };
}
