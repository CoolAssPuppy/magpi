import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MODELS } from '@/lib/models';

import type { ChatMessage, ChatRequest } from './chat';
import type { StreamedChunk } from './call';

type ProviderRequest = {
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  readonly max_completion_tokens: number;
  readonly stream: boolean;
  readonly stream_options?: { readonly include_usage: boolean };
};

type ProviderUsage = { readonly prompt_tokens: number; readonly completion_tokens: number };

type Completion = {
  readonly choices: readonly { readonly message: { readonly content: string | null } }[];
  readonly usage: ProviderUsage | null;
};

type Chunk = {
  readonly choices: readonly { readonly delta: { readonly content?: string | null } }[];
  readonly usage: ProviderUsage | null;
};

function completion(overrides: Partial<Completion> = {}): Completion {
  return {
    choices: [{ message: { content: 'ENG-4417 blocks the SSO rollout.' } }],
    usage: { prompt_tokens: 320, completion_tokens: 18 },
    ...overrides,
  };
}

function chunk(overrides: Partial<Chunk> = {}): Chunk {
  return { choices: [{ delta: { content: 'ENG' } }], usage: null, ...overrides };
}

const provider = {
  requests: [] as ProviderRequest[],
  completion: completion(),
  chunks: [chunk()] as readonly Chunk[],
};

vi.mock('./client', () => ({
  createOpenAIClient: () => ({
    chat: {
      completions: {
        create: async (request: ProviderRequest) => {
          provider.requests.push(request);
          if (!request.stream) return provider.completion;
          return (async function* () {
            for (const streamed of provider.chunks) yield streamed;
          })();
        },
      },
    },
  }),
}));

const { defaultChatCompletion, defaultChatStream } = await import('./chat');

const REQUEST: ChatRequest = {
  model: MODELS.chat,
  messages: [
    { role: 'system', content: 'Answer from the sources.' },
    { role: 'user', content: 'What blocks SSO?' },
  ],
  maxOutputTokens: 900,
};

async function collect(
  stream: AsyncIterable<StreamedChunk<string>>,
): Promise<StreamedChunk<string>[]> {
  const received: StreamedChunk<string>[] = [];
  for await (const streamed of stream) received.push(streamed);
  return received;
}

beforeEach(() => {
  provider.requests = [];
  provider.completion = completion();
  provider.chunks = [chunk()];
});

describe('a buffered chat call', () => {
  it('asks the provider for the model, the conversation and the output cap it was given', async () => {
    const chat = await defaultChatCompletion();

    await chat(REQUEST);

    expect(provider.requests[0]).toMatchObject({
      model: MODELS.chat,
      messages: REQUEST.messages,
      max_completion_tokens: 900,
      stream: false,
    });
  });

  it('returns the answer and what it cost', async () => {
    const chat = await defaultChatCompletion();

    const result = await chat(REQUEST);

    expect(result).toEqual({
      text: 'ENG-4417 blocks the SSO rollout.',
      usage: { inputTokens: 320, outputTokens: 18 },
    });
  });

  it('reads a refused answer as empty text that cost nothing', async () => {
    provider.completion = completion({ choices: [], usage: null });
    const chat = await defaultChatCompletion();

    const result = await chat(REQUEST);

    expect(result).toEqual({ text: '', usage: { inputTokens: 0, outputTokens: 0 } });
  });

  it('reads a model that answered with nothing as empty text', async () => {
    provider.completion = completion({ choices: [{ message: { content: null } }] });
    const chat = await defaultChatCompletion();

    expect((await chat(REQUEST)).text).toBe('');
  });
});

describe('a streamed chat call', () => {
  it('hands each piece of the answer on as it arrives', async () => {
    provider.chunks = [
      chunk({ choices: [{ delta: { content: 'ENG-4417 ' } }] }),
      chunk({ choices: [{ delta: { content: 'blocks SSO.' } }] }),
    ];
    const stream = await defaultChatStream();

    const received = await collect(stream(REQUEST));

    expect(received.map((piece) => piece.delta).join('')).toBe('ENG-4417 blocks SSO.');
  });

  it('reports the totals the provider sends after the last word', async () => {
    provider.chunks = [
      chunk({ choices: [{ delta: { content: 'done' } }] }),
      chunk({ choices: [], usage: { prompt_tokens: 412, completion_tokens: 6 } }),
    ];
    const stream = await defaultChatStream();

    const received = await collect(stream(REQUEST));

    expect(received.map((piece) => piece.usage)).toEqual([
      null,
      { inputTokens: 412, outputTokens: 6 },
    ]);
  });

  it('asks the provider for those totals, without which a streamed answer meters at zero', async () => {
    const stream = await defaultChatStream();

    await collect(stream(REQUEST));

    expect(provider.requests[0]).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    });
  });

  it('yields nothing readable for a chunk that carries no text', async () => {
    provider.chunks = [chunk({ choices: [{ delta: {} }] })];
    const stream = await defaultChatStream();

    const received = await collect(stream(REQUEST));

    expect(received).toEqual([{ delta: '', usage: null }]);
  });
});
