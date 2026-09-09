import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MODELS } from '@/lib/models';

import type { ModelCallRecord } from './call';
import type { ChatCompletionPort, ChatMessage, ChatRequest } from './chat';

type ProviderRequest = { readonly model: string; readonly max_completion_tokens: number };

const provider = { requests: [] as ProviderRequest[] };

vi.mock('./client', () => ({
  createOpenAIClient: () => ({
    chat: {
      completions: {
        create: async (request: ProviderRequest) => {
          provider.requests.push(request);
          return {
            choices: [{ message: { content: 'Sso rollout' } }],
            usage: { prompt_tokens: 44, completion_tokens: 3 },
          };
        },
      },
    },
  }),
}));

const { completeText } = await import('./complete');

const MESSAGES: readonly ChatMessage[] = [
  { role: 'system', content: 'Name this conversation.' },
  { role: 'user', content: 'What blocks SSO?' },
];

function chatPort(answer = 'Sso rollout'): {
  port: ChatCompletionPort;
  requests: ChatRequest[];
} {
  const requests: ChatRequest[] = [];
  return {
    requests,
    port: async (request) => {
      requests.push(request);
      return { text: answer, usage: { inputTokens: 44, outputTokens: 3 } };
    },
  };
}

const swallowUsage = async () => {};

beforeEach(() => {
  provider.requests = [];
});

describe('completeText', () => {
  it('returns what the model wrote', async () => {
    const { port } = chatPort('Sso rollout blockers');

    const text = await completeText(
      { purpose: 'title', orgId: 'org-1', messages: MESSAGES, maxOutputTokens: 24 },
      { chat: port, record: swallowUsage },
    );

    expect(text).toBe('Sso rollout blockers');
  });

  it('sends the conversation to the model pinned for that purpose', async () => {
    const { port, requests } = chatPort();

    await completeText(
      { purpose: 'condense', orgId: 'org-1', messages: MESSAGES, maxOutputTokens: 120 },
      { chat: port, record: swallowUsage },
    );

    expect(requests).toEqual([
      { model: MODELS.condense, messages: MESSAGES, maxOutputTokens: 120 },
    ]);
  });

  it('meters the call under the purpose it was asked for', async () => {
    const { port } = chatPort();
    const records: ModelCallRecord[] = [];

    await completeText(
      { purpose: 'title', orgId: 'org-8', messages: MESSAGES, maxOutputTokens: 24 },
      {
        chat: port,
        record: async (entry) => {
          records.push(entry);
        },
      },
    );

    expect(records).toEqual([
      expect.objectContaining({
        orgId: 'org-8',
        purpose: 'title',
        model: MODELS.title,
        usage: { inputTokens: 44, outputTokens: 3 },
        succeeded: true,
      }),
    ]);
  });

  it('goes to the provider when the caller stands nothing in for it', async () => {
    const text = await completeText(
      { purpose: 'dream', orgId: 'org-1', messages: MESSAGES, maxOutputTokens: 300 },
      { record: swallowUsage },
    );

    expect(text).toBe('Sso rollout');
    expect(provider.requests).toEqual([
      expect.objectContaining({ model: MODELS.dream, max_completion_tokens: 300 }),
    ]);
  });
});
