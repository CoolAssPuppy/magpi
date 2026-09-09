import { describe, expect, it, vi } from 'vitest';

import type { RetrievedChunk } from '@/lib/search/search';

import { runAnswerTurn, type AnswerDeps, type AnswerTurnInput } from './answer';
import type { ChatEvent, Citation } from './protocol';

const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';
const USER_MESSAGE_ID = '55555555-5555-4555-8555-555555555555';
const ASSISTANT_MESSAGE_ID = '66666666-6666-4666-8666-666666666666';
const CHUNK_ID = '11111111-1111-4111-8111-111111111111';

type StoreCall = { readonly name: string; readonly payload: unknown };

const hit = (overrides: Partial<RetrievedChunk> = {}): RetrievedChunk => ({
  chunkId: CHUNK_ID,
  documentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  spaceId: '33333333-3333-4333-8333-333333333333',
  content: 'The SSO rollout is blocked on ENG-4417.',
  score: 0.03,
  ...overrides,
});

const citation = (overrides: Partial<Citation> = {}): Citation => ({
  chunkId: CHUNK_ID,
  documentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  documentTitle: 'Q3 platform notes',
  excerpt: 'The SSO rollout is blocked on ENG-4417.',
  label: 1,
  ...overrides,
});

const turnInput = (overrides: Partial<AnswerTurnInput> = {}): AnswerTurnInput => ({
  conversationId: CONVERSATION_ID,
  orgId: 'org-1',
  question: 'What is blocking SSO?',
  spaceFilter: null,
  history: [],
  needsTitle: false,
  ...overrides,
});

function fakeDeps(overrides: Partial<AnswerDeps> = {}): {
  deps: AnswerDeps;
  calls: StoreCall[];
} {
  const calls: StoreCall[] = [];
  let clock = 1000;

  const deps: AnswerDeps = {
    store: {
      addUserMessage: async (payload) => {
        calls.push({ name: 'addUserMessage', payload });
        return USER_MESSAGE_ID;
      },
      addAssistantMessage: async (payload) => {
        calls.push({ name: 'addAssistantMessage', payload });
        return ASSISTANT_MESSAGE_ID;
      },
      setCondensedQuery: async (...payload) => {
        calls.push({ name: 'setCondensedQuery', payload });
      },
      setTitle: async (...payload) => {
        calls.push({ name: 'setTitle', payload });
      },
    },
    condense: async ({ question }) => ({ kind: 'original', text: question }),
    search: async () => [hit()],
    resolveCitations: async () => [citation()],
    streamAnswer: async function* () {
      yield 'SSO is blocked on ENG-4417 [1].';
      return { inputTokens: 300, outputTokens: 12 };
    },
    generateTitle: async () => 'SSO blockers',
    now: () => (clock += 250),
    ...overrides,
  };

  return { deps, calls };
}

async function collect(events: AsyncGenerator<ChatEvent>): Promise<ChatEvent[]> {
  const seen: ChatEvent[] = [];
  for await (const event of events) seen.push(event);
  return seen;
}

describe('runAnswerTurn', () => {
  it('persists the question before it calls a model', async () => {
    const { deps, calls } = fakeDeps({
      streamAnswer: async function* () {
        expect(calls.map((call) => call.name)).toContain('addUserMessage');
        yield 'answer';
        return { inputTokens: 1, outputTokens: 1 };
      },
    });

    await collect(runAnswerTurn(turnInput(), deps));

    expect(calls[0]).toEqual({
      name: 'addUserMessage',
      payload: { conversationId: CONVERSATION_ID, content: 'What is blocking SSO?' },
    });
  });

  it('sends the citations before the first token of the answer', async () => {
    const { deps } = fakeDeps();

    const events = await collect(runAnswerTurn(turnInput(), deps));

    expect(events[0]).toEqual({ type: 'citations', citations: [citation()] });
    expect(events[1]).toEqual({ type: 'delta', text: 'SSO is blocked on ENG-4417 [1].' });
  });

  it('retrieves on the rewritten question and answers the one that was asked', async () => {
    const searched: string[] = [];
    const { deps } = fakeDeps({
      condense: async () => ({ kind: 'rewritten', text: 'What is blocking single sign on?' }),
      search: async (input) => {
        searched.push(input.queryText);
        return [hit()];
      },
    });

    await collect(
      runAnswerTurn(turnInput({ history: [{ role: 'user', content: 'earlier' }] }), deps),
    );

    expect(searched).toEqual(['What is blocking single sign on?']);
  });

  it('records the chunk ids, latency and token count on the assistant message', async () => {
    const { deps, calls } = fakeDeps();

    await collect(runAnswerTurn(turnInput(), deps));

    const written = calls.find((call) => call.name === 'addAssistantMessage');
    expect(written?.payload).toMatchObject({
      conversationId: CONVERSATION_ID,
      content: 'SSO is blocked on ENG-4417 [1].',
      citations: [CHUNK_ID],
      tokenCount: 312,
    });
    expect((written?.payload as { latencyMs: number }).latencyMs).toBeGreaterThan(0);
  });

  it('keeps the rewritten question on the user message for debugging', async () => {
    const { deps, calls } = fakeDeps({
      condense: async () => ({ kind: 'rewritten', text: 'What is blocking single sign on?' }),
    });

    await collect(runAnswerTurn(turnInput(), deps));

    expect(calls).toContainEqual({
      name: 'setCondensedQuery',
      payload: [USER_MESSAGE_ID, 'What is blocking single sign on?'],
    });
  });

  it('stores no rewrite for a first turn, which was never rewritten', async () => {
    const { deps, calls } = fakeDeps();

    await collect(runAnswerTurn(turnInput(), deps));

    expect(calls.map((call) => call.name)).not.toContain('setCondensedQuery');
  });

  it('names an unnamed conversation only after the answer is closed', async () => {
    const { deps } = fakeDeps();

    const events = await collect(runAnswerTurn(turnInput({ needsTitle: true }), deps));

    const doneAt = events.findIndex((event) => event.type === 'done');
    const titleAt = events.findIndex((event) => event.type === 'title');
    expect(doneAt).toBeGreaterThan(-1);
    expect(titleAt).toBeGreaterThan(doneAt);
    expect(events[titleAt]).toEqual({ type: 'title', title: 'SSO blockers' });
  });

  it('leaves an already named conversation alone', async () => {
    const { deps, calls } = fakeDeps();

    const events = await collect(runAnswerTurn(turnInput({ needsTitle: false }), deps));

    expect(calls.map((call) => call.name)).not.toContain('setTitle');
    expect(events.some((event) => event.type === 'title')).toBe(false);
  });

  it('answers with an error event rather than throwing into the stream', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps, calls } = fakeDeps({
      streamAnswer: async function* () {
        yield 'partial';
        throw new Error('connection reset');
      },
    });

    const events = await collect(runAnswerTurn(turnInput(), deps));

    expect(events.at(-1)).toEqual({
      type: 'error',
      message: 'Something went wrong answering that. Ask again.',
    });
    expect(calls.map((call) => call.name)).toContain('addUserMessage');
    expect(calls.map((call) => call.name)).not.toContain('addAssistantMessage');
    consoleError.mockRestore();
  });

  // The answer is already on the reader's screen and already stored by the
  // time either of these runs. Turning a failed housekeeping write into an
  // error event takes the delivered answer off the screen and replaces it with
  // "ask again", which asks the reader to pay for it twice.
  it('keeps a delivered answer when naming the conversation fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps } = fakeDeps({
      generateTitle: async () => {
        throw new Error('rate limited');
      },
    });

    const events = await collect(runAnswerTurn(turnInput({ needsTitle: true }), deps));

    expect(events.at(-1)).toEqual({ type: 'done', messageId: ASSISTANT_MESSAGE_ID });
    expect(events.some((event) => event.type === 'error')).toBe(false);
    consoleError.mockRestore();
  });

  it('keeps a delivered answer when storing the rewritten question fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps } = fakeDeps({
      condense: async () => ({ kind: 'rewritten', text: 'What blocks SSO rollout?' }),
      store: {
        addUserMessage: async () => USER_MESSAGE_ID,
        addAssistantMessage: async () => ASSISTANT_MESSAGE_ID,
        setCondensedQuery: async () => {
          throw new Error('write failed');
        },
        setTitle: async () => {},
      },
    });

    const events = await collect(runAnswerTurn(turnInput(), deps));

    expect(events.at(-1)).toEqual({ type: 'done', messageId: ASSISTANT_MESSAGE_ID });
    expect(events.some((event) => event.type === 'error')).toBe(false);
    consoleError.mockRestore();
  });

  it('leaves a recoverable conversation when the reader drops the connection', async () => {
    const { deps, calls } = fakeDeps({
      streamAnswer: async function* () {
        yield 'half an ans';
        yield 'wer that never arrives';
        return { inputTokens: 300, outputTokens: 12 };
      },
    });

    // What the route does in its cancel handler when the client goes away.
    const events = runAnswerTurn(turnInput(), deps);
    await events.next();
    await events.next();
    await events.return(undefined);

    const written = calls.map((call) => call.name);
    expect(written).toContain('addUserMessage');
    expect(written).not.toContain('addAssistantMessage');
  });

  it('answers from nothing rather than failing when retrieval finds no passages', async () => {
    const { deps } = fakeDeps({
      search: async () => [],
      resolveCitations: async () => [],
      streamAnswer: async function* () {
        yield 'I do not have a document that covers that.';
        return { inputTokens: 40, outputTokens: 9 };
      },
    });

    const events = await collect(runAnswerTurn(turnInput(), deps));

    expect(events[0]).toEqual({ type: 'citations', citations: [] });
    expect(events.at(-1)).toEqual({ type: 'done', messageId: ASSISTANT_MESSAGE_ID });
  });

  it('answers with an error event when the question itself cannot be stored', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps } = fakeDeps();
    const refusing: AnswerDeps = {
      ...deps,
      store: {
        ...deps.store,
        addUserMessage: async () => {
          throw new Error('new row violates row-level security');
        },
      },
    };

    const events = await collect(runAnswerTurn(turnInput(), refusing));

    expect(events).toEqual([
      { type: 'error', message: 'Something went wrong answering that. Ask again.' },
    ]);
    consoleError.mockRestore();
  });
});
