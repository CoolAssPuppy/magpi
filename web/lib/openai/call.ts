import { MODELS, type ModelPurpose } from '@/lib/models';
import type { Database } from '@/lib/database.types';

export type ModelUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
};

export const NO_USAGE: ModelUsage = { inputTokens: 0, outputTokens: 0 };

export type ModelCallOutcome<T> = {
  readonly value: T;
  readonly usage: ModelUsage;
};

export type ModelCallRecord = {
  readonly orgId: string;
  readonly purpose: ModelPurpose;
  readonly model: string;
  readonly usage: ModelUsage;
  readonly latencyMs: number;
  readonly succeeded: boolean;
};

export type UsageRecorder = (record: ModelCallRecord) => Promise<void>;

export type ModelCallInput<T> = {
  readonly purpose: ModelPurpose;
  readonly orgId: string;
  readonly run: (model: string) => Promise<ModelCallOutcome<T>>;
};

type UsageKind = Database['public']['Enums']['usage_kind'];

export function usageKindFor(
  purpose: ModelPurpose,
): Extract<UsageKind, 'embedding_tokens' | 'chat_tokens'> {
  switch (purpose) {
    case 'embedding':
      return 'embedding_tokens';
    case 'chat':
    case 'condense':
    case 'title':
    case 'dream':
      return 'chat_tokens';
    default: {
      const unhandled: never = purpose;
      return unhandled;
    }
  }
}

/**
 * Imported at call time rather than at the top of the file. The recorder reaches
 * the service client, which is `server-only`, and this module is the one every
 * caller of a model goes through, including the ones under test.
 */
const recordThroughServiceClient: UsageRecorder = async (record) => {
  const { recordModelCall } = await import('./usage-recorder');
  await recordModelCall(record);
};

/**
 * The one wrapper every model call goes through. It resolves the pinned id for
 * the purpose, times the call, and writes what it cost into model_calls and
 * usage_events. A call that throws is still recorded, with succeeded false.
 */
export async function callModel<T>(
  input: ModelCallInput<T>,
  record: UsageRecorder = recordThroughServiceClient,
): Promise<T> {
  const model = MODELS[input.purpose];
  const startedAt = Date.now();

  try {
    const outcome = await input.run(model);
    await report(record, {
      orgId: input.orgId,
      purpose: input.purpose,
      model,
      usage: outcome.usage,
      latencyMs: Date.now() - startedAt,
      succeeded: true,
    });
    return outcome.value;
  } catch (error) {
    await report(record, {
      orgId: input.orgId,
      purpose: input.purpose,
      model,
      usage: NO_USAGE,
      latencyMs: Date.now() - startedAt,
      succeeded: false,
    });
    throw error;
  }
}

export type StreamedChunk<T> = {
  readonly delta: T;
  /** Present on the final chunk only, when the provider reports totals. */
  readonly usage: ModelUsage | null;
};

export type StreamedModelCallInput<T> = {
  readonly purpose: ModelPurpose;
  readonly orgId: string;
  readonly run: (model: string) => AsyncIterable<StreamedChunk<T>>;
};

/**
 * The streaming half of the same wrapper. It shares the timing and the usage
 * write with callModel, so a streamed answer is metered exactly like a
 * buffered one. Returns the totals the provider reported.
 */
export async function* callModelStreaming<T>(
  input: StreamedModelCallInput<T>,
  record: UsageRecorder = recordThroughServiceClient,
): AsyncGenerator<T, ModelUsage> {
  const model = MODELS[input.purpose];
  const startedAt = Date.now();
  let usage = NO_USAGE;

  try {
    for await (const chunk of input.run(model)) {
      if (chunk.usage) usage = chunk.usage;
      yield chunk.delta;
    }
  } catch (error) {
    await report(record, {
      orgId: input.orgId,
      purpose: input.purpose,
      model,
      usage,
      latencyMs: Date.now() - startedAt,
      succeeded: false,
    });
    throw error;
  }

  await report(record, {
    orgId: input.orgId,
    purpose: input.purpose,
    model,
    usage,
    latencyMs: Date.now() - startedAt,
    succeeded: true,
  });

  return usage;
}

/** A telemetry write must never turn a finished answer into a failed request. */
async function report(record: UsageRecorder, entry: ModelCallRecord): Promise<void> {
  try {
    await record(entry);
  } catch (error) {
    console.error('model usage write failed', { purpose: entry.purpose, error });
  }
}
