import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

type ClientOptions = { readonly apiKey: string };

const constructed: ClientOptions[] = [];

vi.mock('openai', () => ({
  default: class FakeOpenAI {
    constructor(options: ClientOptions) {
      constructed.push(options);
    }
  },
}));

const { createOpenAIClient } = await import('./client');
const { openaiClient } = await import('./lazy-client');

const configuredKey = process.env.OPENAI_API_KEY;

beforeEach(() => {
  constructed.length = 0;
});

afterEach(() => {
  process.env.OPENAI_API_KEY = configuredKey;
});

describe('the OpenAI client', () => {
  it('carries the key the environment holds', () => {
    createOpenAIClient();

    expect(constructed).toEqual([{ apiKey: configuredKey }]);
  });

  it('refuses to exist without a key, rather than failing at the first model call', () => {
    delete process.env.OPENAI_API_KEY;

    expect(() => createOpenAIClient()).toThrow();
    expect(constructed).toEqual([]);
  });

  it('is built per call, so one request cannot inherit another request client', () => {
    createOpenAIClient();
    createOpenAIClient();

    expect(constructed).toHaveLength(2);
  });
});

describe('resolving the client at call time', () => {
  it('hands back a configured client without the key module reaching a caller import', async () => {
    await openaiClient();

    expect(constructed).toEqual([{ apiKey: configuredKey }]);
  });
});
