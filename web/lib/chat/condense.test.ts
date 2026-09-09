import { describe, expect, it } from 'vitest';

import type { ChatMessage } from '@/lib/openai/chat';

import {
  buildCondenseMessages,
  condenseQuestion,
  CONDENSE_HISTORY_TURNS,
  type ConversationTurn,
} from './condense';

const turn = (overrides: Partial<ConversationTurn> = {}): ConversationTurn => ({
  role: 'user',
  content: 'How did revenue look in Q2?',
  ...overrides,
});

function completionReturning(text: string): {
  complete: (messages: readonly ChatMessage[]) => Promise<string>;
  seen: ChatMessage[][];
} {
  const seen: ChatMessage[][] = [];
  return {
    seen,
    complete: async (messages) => {
      seen.push([...messages]);
      return text;
    },
  };
}

describe('buildCondenseMessages', () => {
  it('gives the model the recent turns and the follow-up', () => {
    const messages = buildCondenseMessages(
      [turn(), turn({ role: 'assistant', content: 'Revenue was 4.1M.' })],
      'What about last quarter?',
    );

    const transcript = messages.map((message) => message.content).join('\n');
    expect(transcript).toContain('How did revenue look in Q2?');
    expect(transcript).toContain('Revenue was 4.1M.');
    expect(transcript).toContain('What about last quarter?');
  });

  it('keeps only the last few turns, so the rewrite stays cheap', () => {
    const history = Array.from({ length: CONDENSE_HISTORY_TURNS + 4 }, (_, index) =>
      turn({ content: `turn ${index}` }),
    );

    const transcript = buildCondenseMessages(history, 'and now?')
      .map((message) => message.content)
      .join('\n');

    expect(transcript).not.toContain('turn 0');
    expect(transcript).toContain(`turn ${history.length - 1}`);
  });

  it('opens with an instruction the answer model never sees', () => {
    const messages = buildCondenseMessages([turn()], 'and now?');

    expect(messages[0].role).toBe('system');
  });
});

describe('condenseQuestion', () => {
  it('makes no model call on the first turn of a conversation', async () => {
    const { complete, seen } = completionReturning('should not be used');

    const condensed = await condenseQuestion(
      { question: 'What is our SSO ticket?', history: [], orgId: 'org-1' },
      { complete },
    );

    expect(condensed).toEqual({ kind: 'original', text: 'What is our SSO ticket?' });
    expect(seen).toHaveLength(0);
  });

  it('rewrites a follow-up into a standalone question', async () => {
    const { complete } = completionReturning('How did revenue look in Q1?');

    const condensed = await condenseQuestion(
      {
        question: 'What about last quarter?',
        history: [turn(), turn({ role: 'assistant', content: 'Revenue was 4.1M.' })],
        orgId: 'org-1',
      },
      { complete },
    );

    expect(condensed).toEqual({ kind: 'rewritten', text: 'How did revenue look in Q1?' });
  });

  it('falls back to the question as asked when the rewrite comes back empty', async () => {
    const { complete } = completionReturning('   ');

    const condensed = await condenseQuestion(
      { question: 'What about last quarter?', history: [turn()], orgId: 'org-1' },
      { complete },
    );

    expect(condensed).toEqual({ kind: 'original', text: 'What about last quarter?' });
  });
});
