import { describe, expect, it } from 'vitest';

import { toChatTurns } from './history';
import type { StoredMessage } from './store';
import { chunkRow, readerSeeing } from './test-support';

const CHUNK_A = '11111111-1111-4111-8111-111111111111';
const CHUNK_B = '22222222-2222-4222-8222-222222222222';

const message = (overrides: Partial<StoredMessage> = {}): StoredMessage => ({
  id: '55555555-5555-4555-8555-555555555555',
  role: 'user',
  content: 'What is blocking SSO?',
  citations: [],
  createdAt: '2026-09-09T10:00:00Z',
  ...overrides,
});

describe('toChatTurns', () => {
  it('renders a stored conversation as questions and answers', async () => {
    const { supabase } = readerSeeing([chunkRow()]);

    const turns = await toChatTurns(supabase, [
      message(),
      message({
        id: '66666666-6666-4666-8666-666666666666',
        role: 'assistant',
        content: 'Blocked on ENG-4417 [1].',
        citations: [CHUNK_A],
      }),
    ]);

    expect(turns[0]).toEqual({
      kind: 'question',
      id: '55555555-5555-4555-8555-555555555555',
      content: 'What is blocking SSO?',
    });
    expect(turns[1]).toMatchObject({
      kind: 'answer',
      content: 'Blocked on ENG-4417 [1].',
      streaming: false,
    });
    expect(turns[1]).toHaveProperty('citations', [
      expect.objectContaining({ chunkId: CHUNK_A, label: 1 }),
    ]);
  });

  it('shows the answer without the citation when the reader lost the space', async () => {
    const { supabase } = readerSeeing([]);

    const turns = await toChatTurns(supabase, [
      message({
        role: 'assistant',
        content: 'Blocked on ENG-4417 [1].',
        citations: [CHUNK_A, CHUNK_B],
      }),
    ]);

    expect(turns[0]).toMatchObject({
      kind: 'answer',
      content: 'Blocked on ENG-4417 [1].',
      citations: [],
    });
  });

  it('reads no chunks for a conversation that has none', async () => {
    const { supabase, asked } = readerSeeing([chunkRow()]);

    const turns = await toChatTurns(supabase, [message()]);

    expect(turns).toHaveLength(1);
    expect(asked).toEqual([]);
  });
});
