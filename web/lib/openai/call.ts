import { MODELS, type ModelPurpose } from '@/lib/models';

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

/** Imported at call time, because the recorder reaches the `server-only` service client. */
const recordThroughServiceClient: UsageRecorder = async (record) => {
  const { recordModelCall } = await import('./usage-recorder');
  await recordModelCall(record);
};

/** The one wrapper every model call goes through. A call that throws is recorded too. */
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

/** The streaming half of the same wrapper. Returns the totals the provider reported. */
export async function* callModelStreaming<T>(
  input: StreamedModelCallInput<T>,
  record: UsageRecorder = recordThroughServiceClient,
): AsyncGenerator<T, ModelUsage> {
  const model = MODELS[input.purpose];
  const startedAt = Date.now();
  let usage = NO_USAGE;
  let succeeded = false;

  try {
    for await (const chunk of input.run(model)) {
      if (chunk.usage) usage = chunk.usage;
      yield chunk.delta;
    }
    succeeded = true;
    return usage;
  } finally {
    // In `finally`, because an abandoned stream unwinds at a yield and reaches no other path.
    await report(record, {
      orgId: input.orgId,
      purpose: input.purpose,
      model,
      usage,
      latencyMs: Date.now() - startedAt,
      succeeded,
    });
  }
}

/** A telemetry write must never turn a finished answer into a failed request. */
async function report(record: UsageRecorder, entry: ModelCallRecord): Promise<void> {
  try {
    await record(entry);
  } catch (error) {
    console.error('model usage write failed', { purpose: entry.purpose, error });
  }
}
