import { describe, expect, it } from 'vitest';

import { EMBEDDING_DIMENSIONS, MODELS } from '@/lib/models';
import type { ModelCallRecord } from './call';

import { embed, type EmbeddingsPort } from './embed';

function fakeEmbeddings(
  overrides: Partial<{ vectors: readonly (readonly number[])[]; promptTokens: number }> = {},
): { port: EmbeddingsPort; calls: Parameters<EmbeddingsPort>[0][] } {
  const vectors = overrides.vectors ?? [[0.1, 0.2, 0.3]];
  const promptTokens = overrides.promptTokens ?? 12;
  const calls: Parameters<EmbeddingsPort>[0][] = [];

  return {
    calls,
    port: async (params) => {
      calls.push(params);
      return {
        // Returned out of order on purpose: the API does not promise ordering.
        data: vectors.map((embedding, index) => ({ index, embedding: [...embedding] })).reverse(),
        usage: { prompt_tokens: promptTokens },
      };
    },
  };
}

const swallowUsage = async () => {};

describe('embed', () => {
  it('asks for the pinned embedding model at the dimension count chunks declares', async () => {
    const { port, calls } = fakeEmbeddings();

    await embed({ texts: ['hello'], orgId: 'org-1' }, { embeddings: port, record: swallowUsage });

    expect(calls[0]).toEqual({
      model: MODELS.embedding,
      input: ['hello'],
      dimensions: EMBEDDING_DIMENSIONS,
    });
  });

  it('returns one vector per input text, in input order', async () => {
    const { port } = fakeEmbeddings({
      vectors: [
        [1, 0],
        [0, 1],
      ],
    });

    const vectors = await embed(
      { texts: ['first', 'second'], orgId: 'org-1' },
      { embeddings: port, record: swallowUsage },
    );

    expect(vectors).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it('meters the embedding tokens it spent', async () => {
    const { port } = fakeEmbeddings({ promptTokens: 41 });
    const records: ModelCallRecord[] = [];

    await embed(
      { texts: ['hello'], orgId: 'org-9' },
      {
        embeddings: port,
        record: async (entry) => {
          records.push(entry);
        },
      },
    );

    expect(records[0]).toMatchObject({
      orgId: 'org-9',
      purpose: 'embedding',
      usage: { inputTokens: 41, outputTokens: 0 },
      succeeded: true,
    });
  });

  it('makes no model call for an empty batch', async () => {
    const { port, calls } = fakeEmbeddings();

    const vectors = await embed({ texts: [], orgId: 'org-1' }, { embeddings: port });

    expect(vectors).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
