import type { ModelUsage, StreamedChunk } from './call';
import { openaiClient } from './lazy-client';

export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
  readonly role: ChatRole;
  readonly content: string;
};

export type ChatRequest = {
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  readonly maxOutputTokens: number;
};

/** The narrow slice of chat completions this app uses, so a test can stand in. */
export type ChatCompletionPort = (
  request: ChatRequest,
) => Promise<{ readonly text: string; readonly usage: ModelUsage }>;

export type ChatStreamPort = (request: ChatRequest) => AsyncIterable<StreamedChunk<string>>;

export async function defaultChatCompletion(): Promise<ChatCompletionPort> {
  const client = await openaiClient();

  return async (request) => {
    const response = await client.chat.completions.create({
      model: request.model,
      messages: [...request.messages],
      max_completion_tokens: request.maxOutputTokens,
      stream: false,
    });

    return {
      text: response.choices[0]?.message.content ?? '',
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  };
}

export async function defaultChatStream(): Promise<ChatStreamPort> {
  const client = await openaiClient();

  return async function* (request) {
    const stream = await client.chat.completions.create({
      model: request.model,
      messages: [...request.messages],
      max_completion_tokens: request.maxOutputTokens,
      stream: true,
      // The totals arrive on a final chunk with no delta, so without this a stream meters zero.
      stream_options: { include_usage: true },
    });

    for await (const chunk of stream) {
      const usage = chunk.usage
        ? { inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens }
        : null;
      yield { delta: chunk.choices[0]?.delta.content ?? '', usage };
    }
  };
}
