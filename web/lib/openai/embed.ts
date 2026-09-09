import { EMBEDDING_DIMENSIONS } from '@/lib/models';

import { callModel, type UsageRecorder } from './call';
import { openaiClient } from './lazy-client';

export type Embedding = readonly number[];

export type EmbeddingsRequest = {
  readonly model: string;
  readonly input: readonly string[];
  readonly dimensions: number;
};

export type EmbeddingsResponse = {
  readonly data: readonly { readonly index: number; readonly embedding: readonly number[] }[];
  readonly usage: { readonly prompt_tokens: number };
};

/** The narrow slice of the embeddings API this app uses, so a test can stand in. */
export type EmbeddingsPort = (request: EmbeddingsRequest) => Promise<EmbeddingsResponse>;

export type EmbedInput = {
  readonly texts: readonly string[];
  readonly orgId: string;
};

export type EmbedDeps = {
  readonly embeddings?: EmbeddingsPort;
  readonly record?: UsageRecorder;
};

export async function embed(
  { texts, orgId }: EmbedInput,
  deps: EmbedDeps = {},
): Promise<readonly Embedding[]> {
  if (texts.length === 0) return [];

  const embeddings = deps.embeddings ?? (await defaultEmbeddings());

  return callModel(
    {
      purpose: 'embedding',
      orgId,
      run: async (model) => {
        const response = await embeddings({ model, input: texts, dimensions: EMBEDDING_DIMENSIONS });
        const ordered = [...response.data].sort((a, b) => a.index - b.index);

        return {
          value: ordered.map((item) => item.embedding),
          usage: { inputTokens: response.usage.prompt_tokens, outputTokens: 0 },
        };
      },
    },
    deps.record,
  );
}

async function defaultEmbeddings(): Promise<EmbeddingsPort> {
  const client = await openaiClient();
  return (request) =>
    client.embeddings.create({
      model: request.model,
      input: [...request.input],
      dimensions: request.dimensions,
    });
}
