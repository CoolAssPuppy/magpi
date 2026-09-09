import type { ModelPurpose } from '@/lib/models';

import { callModel, type UsageRecorder } from './call';
import { defaultChatCompletion, type ChatCompletionPort, type ChatMessage } from './chat';

export type CompleteInput = {
  readonly purpose: ModelPurpose;
  readonly orgId: string;
  readonly messages: readonly ChatMessage[];
  readonly maxOutputTokens: number;
};

export type CompleteDeps = {
  readonly chat?: ChatCompletionPort;
  readonly record?: UsageRecorder;
};

/** A buffered model call, metered like every other one. */
export async function completeText(input: CompleteInput, deps: CompleteDeps = {}): Promise<string> {
  const chat = deps.chat ?? (await defaultChatCompletion());

  return callModel(
    {
      purpose: input.purpose,
      orgId: input.orgId,
      run: async (model) => {
        const completion = await chat({
          model,
          messages: input.messages,
          maxOutputTokens: input.maxOutputTokens,
        });
        return { value: completion.text, usage: completion.usage };
      },
    },
    deps.record,
  );
}
