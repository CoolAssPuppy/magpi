import { describe, expect, it } from 'vitest';

import type { RetrievedChunk } from '@/lib/search/search';

import { buildAnswerMessages, PROMPT_HISTORY_TURNS } from './prompt';
import type { ConversationTurn } from './condense';

const hit = (overrides: Partial<RetrievedChunk> = {}): RetrievedChunk => ({
  chunkId: '11111111-1111-4111-8111-111111111111',
  documentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  spaceId: '33333333-3333-4333-8333-333333333333',
  content: 'The SSO rollout is blocked on ENG-4417.',
  score: 0.03,
  ...overrides,
});

describe('buildAnswerMessages', () => {
  it('numbers the retrieved passages so the answer can cite them', () => {
    const messages = buildAnswerMessages({
      question: 'What is blocking SSO?',
      chunks: [hit(), hit({ chunkId: '22222222-2222-4222-8222-222222222222', content: 'Second.' })],
      history: [],
    });

    const context = messages.map((message) => message.content).join('\n');
    expect(context).toContain('[1]');
    expect(context).toContain('The SSO rollout is blocked on ENG-4417.');
    expect(context).toContain('[2]');
    expect(context).toContain('Second.');
  });

  it('asks the question as the person asked it, not as it was rewritten', () => {
    const messages = buildAnswerMessages({
      question: 'What about last quarter?',
      chunks: [hit()],
      history: [{ role: 'user', content: 'How did revenue look in Q2?' }],
    });

    expect(messages.at(-1)).toEqual({ role: 'user', content: 'What about last quarter?' });
  });

  it('replays recent turns so the answer keeps the thread', () => {
    const history: ConversationTurn[] = [
      { role: 'user', content: 'How did revenue look in Q2?' },
      { role: 'assistant', content: 'Revenue was 4.1M.' },
    ];

    const messages = buildAnswerMessages({ question: 'And Q1?', chunks: [hit()], history });

    expect(messages).toContainEqual({ role: 'assistant', content: 'Revenue was 4.1M.' });
  });

  it('keeps only the recent turns, so an old conversation still fits', () => {
    const history: ConversationTurn[] = Array.from(
      { length: PROMPT_HISTORY_TURNS + 4 },
      (_, index) => ({ role: 'user' as const, content: `turn ${index}` }),
    );

    const replayed = buildAnswerMessages({ question: 'now?', chunks: [hit()], history })
      .map((message) => message.content)
      .join('\n');

    expect(replayed).not.toContain('turn 0');
  });

  it('tells the model to say so when nothing was retrieved', () => {
    const messages = buildAnswerMessages({
      question: 'What is blocking SSO?',
      chunks: [],
      history: [],
    });

    expect(messages[0].role).toBe('system');
    expect(messages.some((message) => message.content.includes('No passages'))).toBe(true);
  });
});
