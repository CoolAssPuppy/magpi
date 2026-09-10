import { describe, expect, it } from 'vitest';

import type { Citation } from './protocol';
import { chatReducer, initialChatState, type ChatAction, type ChatState } from './turns';

const MESSAGE_ID = '66666666-6666-4666-8666-666666666666';

const citation = (overrides: Partial<Citation> = {}): Citation => ({
  chunkId: '11111111-1111-4111-8111-111111111111',
  documentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  documentTitle: 'Q3 platform notes',
  documentSource: null,
  excerpt: 'The SSO rollout is blocked on ENG-4417.',
  label: 1,
  ...overrides,
});

function run(actions: readonly ChatAction[], from: ChatState = initialChatState([])): ChatState {
  return actions.reduce(chatReducer, from);
}

const asking: ChatAction = { type: 'ask', question: 'What is blocking SSO?', turnId: 'turn-1' };

describe('chatReducer', () => {
  it('shows the question and a pending answer the moment it is asked', () => {
    const state = run([asking]);

    expect(state.asking).toBe(true);
    expect(state.turns).toEqual([
      { kind: 'question', id: 'turn-1-q', content: 'What is blocking SSO?' },
      { kind: 'answer', id: 'turn-1-a', content: '', citations: [], streaming: true },
    ]);
  });

  it('shows the sources before the answer has any words in it', () => {
    const state = run([
      asking,
      { type: 'event', event: { type: 'citations', citations: [citation()] } },
    ]);

    expect(state.turns.at(-1)).toMatchObject({ citations: [citation()], content: '' });
  });

  it('builds the answer out of the deltas as they land', () => {
    const state = run([
      asking,
      { type: 'event', event: { type: 'delta', text: 'Blocked on ' } },
      { type: 'event', event: { type: 'delta', text: 'ENG-4417.' } },
    ]);

    expect(state.turns.at(-1)).toMatchObject({
      content: 'Blocked on ENG-4417.',
      streaming: true,
    });
  });

  it('settles the answer on its stored id when the turn closes', () => {
    const state = run([
      asking,
      { type: 'event', event: { type: 'delta', text: 'Blocked.' } },
      { type: 'event', event: { type: 'done', messageId: MESSAGE_ID } },
    ]);

    expect(state.asking).toBe(false);
    expect(state.turns.at(-1)).toMatchObject({ id: MESSAGE_ID, streaming: false });
  });

  it('takes the conversation name without touching the turns', () => {
    const state = run([asking, { type: 'event', event: { type: 'title', title: 'SSO blockers' } }]);

    expect(state.title).toBe('SSO blockers');
    expect(state.turns).toHaveLength(2);
  });

  it('replaces a pending answer that failed, keeping the question', () => {
    const state = run([asking, { type: 'event', event: { type: 'error', message: 'Ask again.' } }]);

    expect(state.asking).toBe(false);
    expect(state.turns).toEqual([
      { kind: 'question', id: 'turn-1-q', content: 'What is blocking SSO?' },
      { kind: 'failure', id: 'turn-1-a', message: 'Ask again.' },
    ]);
  });

  it('keeps the turns already on screen when a new question is asked', () => {
    const state = run([
      asking,
      { type: 'event', event: { type: 'done', messageId: MESSAGE_ID } },
      { type: 'ask', question: 'And Q1?', turnId: 'turn-2' },
    ]);

    expect(state.turns).toHaveLength(4);
    expect(state.turns[2]).toMatchObject({ kind: 'question', content: 'And Q1?' });
  });
});
