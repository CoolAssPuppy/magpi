import { describe, expect, it, vi } from 'vitest';

import { MODELS } from '@/lib/models';

import {
  callModel,
  callModelStreaming,
  type ModelCallRecord,
  type StreamedChunk,
  type UsageRecorder,
} from './call';

const defaultRecords: ModelCallRecord[] = [];

vi.mock('./usage-recorder', () => ({
  recordModelCall: async (record: ModelCallRecord) => {
    defaultRecords.push(record);
  },
}));

async function* chunksOf(
  deltas: readonly string[],
  usage: { inputTokens: number; outputTokens: number } | null,
): AsyncGenerator<StreamedChunk<string>> {
  for (const delta of deltas) yield { delta, usage: null };
  if (usage) yield { delta: '', usage };
}

async function drain(
  stream: AsyncGenerator<string, { inputTokens: number; outputTokens: number }>,
): Promise<{ deltas: string[]; usage: { inputTokens: number; outputTokens: number } }> {
  const deltas: string[] = [];
  let step = await stream.next();
  while (!step.done) {
    deltas.push(step.value);
    step = await stream.next();
  }
  return { deltas, usage: step.value };
}

function collectingRecorder(): { records: ModelCallRecord[]; record: UsageRecorder } {
  const records: ModelCallRecord[] = [];
  return {
    records,
    record: async (entry) => {
      records.push(entry);
    },
  };
}

describe('callModel', () => {
  it('hands the run function the pinned model id for the purpose', async () => {
    const { record } = collectingRecorder();
    const seen: string[] = [];

    await callModel(
      {
        purpose: 'condense',
        orgId: 'org-1',
        run: async (model) => {
          seen.push(model);
          return { value: 'rewritten', usage: { inputTokens: 10, outputTokens: 2 } };
        },
      },
      record,
    );

    expect(seen).toEqual([MODELS.condense]);
  });

  it('returns the value the call produced', async () => {
    const { record } = collectingRecorder();

    const value = await callModel(
      {
        purpose: 'title',
        orgId: 'org-1',
        run: async () => ({ value: 'A title', usage: { inputTokens: 4, outputTokens: 3 } }),
      },
      record,
    );

    expect(value).toBe('A title');
  });

  it('records the model id, token counts and latency for a successful call', async () => {
    const { records, record } = collectingRecorder();

    await callModel(
      {
        purpose: 'chat',
        orgId: 'org-7',
        run: async () => ({ value: 'answer', usage: { inputTokens: 120, outputTokens: 45 } }),
      },
      record,
    );

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      orgId: 'org-7',
      purpose: 'chat',
      model: MODELS.chat,
      usage: { inputTokens: 120, outputTokens: 45 },
      succeeded: true,
    });
    expect(records[0].latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('records a failed call with no tokens and rethrows', async () => {
    const { records, record } = collectingRecorder();

    await expect(
      callModel(
        {
          purpose: 'embedding',
          orgId: 'org-2',
          run: async () => {
            throw new Error('upstream refused');
          },
        },
        record,
      ),
    ).rejects.toThrow('upstream refused');

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      purpose: 'embedding',
      succeeded: false,
      usage: { inputTokens: 0, outputTokens: 0 },
    });
  });

  it('returns the answer even when the usage write fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const value = await callModel(
      {
        purpose: 'chat',
        orgId: 'org-3',
        run: async () => ({ value: 'answer', usage: { inputTokens: 1, outputTokens: 1 } }),
      },
      async () => {
        throw new Error('usage table unreachable');
      },
    );

    expect(value).toBe('answer');
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('callModelStreaming', () => {
  it('yields every delta and returns the totals the provider reported', async () => {
    const { record } = collectingRecorder();

    const { deltas, usage } = await drain(
      callModelStreaming(
        {
          purpose: 'chat',
          orgId: 'org-1',
          run: () => chunksOf(['Hel', 'lo'], { inputTokens: 300, outputTokens: 2 }),
        },
        record,
      ),
    );

    expect(deltas.join('')).toBe('Hello');
    expect(usage).toEqual({ inputTokens: 300, outputTokens: 2 });
  });

  it('meters a streamed answer the same way a buffered one is metered', async () => {
    const { records, record } = collectingRecorder();

    await drain(
      callModelStreaming(
        {
          purpose: 'chat',
          orgId: 'org-5',
          run: () => chunksOf(['a'], { inputTokens: 9, outputTokens: 1 }),
        },
        record,
      ),
    );

    expect(records[0]).toMatchObject({
      orgId: 'org-5',
      purpose: 'chat',
      model: MODELS.chat,
      usage: { inputTokens: 9, outputTokens: 1 },
      succeeded: true,
    });
  });

  it('records a stream that breaks part way through as a failure', async () => {
    const { records, record } = collectingRecorder();

    const stream = callModelStreaming(
      {
        purpose: 'chat',
        orgId: 'org-6',
        run: async function* () {
          yield { delta: 'partial', usage: null };
          throw new Error('connection reset');
        },
      },
      record,
    );

    await expect(drain(stream)).rejects.toThrow('connection reset');
    expect(records[0]).toMatchObject({ succeeded: false });
  });
});

describe('the recorder a caller gets for free', () => {
  it('meters a call that wired nothing up, because every model call is metered', async () => {
    await callModel({
      purpose: 'title',
      orgId: 'org-8',
      run: async () => ({ value: 'A title', usage: { inputTokens: 6, outputTokens: 2 } }),
    });

    expect(defaultRecords).toEqual([
      expect.objectContaining({
        orgId: 'org-8',
        purpose: 'title',
        model: MODELS.title,
        usage: { inputTokens: 6, outputTokens: 2 },
        succeeded: true,
      }),
    ]);
  });
});

describe('usageKindFor', () => {
  it('meters embeddings and chat separately', async () => {
    const { usageKindFor } = await import('./call');

    expect(usageKindFor('embedding')).toBe('embedding_tokens');
    expect(usageKindFor('chat')).toBe('chat_tokens');
    expect(usageKindFor('condense')).toBe('chat_tokens');
    expect(usageKindFor('title')).toBe('chat_tokens');
    expect(usageKindFor('dream')).toBe('chat_tokens');
  });
});
