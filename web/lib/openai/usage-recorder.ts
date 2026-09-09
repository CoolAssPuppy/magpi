import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';

import type { ModelCallRecord } from './call';
import { usageKindFor } from './usage-kind';

/**
 * Writes through the service client. A user has no insert grant on model_calls
 * or usage_events, and billing numbers should not depend on one.
 */
export async function recordModelCall(record: ModelCallRecord): Promise<void> {
  const supabase = createServiceClient();
  const tokens = record.usage.inputTokens + record.usage.outputTokens;

  const callWrite = supabase.from('model_calls').insert({
    org_id: record.orgId,
    purpose: record.purpose,
    model: record.model,
    input_tokens: record.usage.inputTokens,
    output_tokens: record.usage.outputTokens,
    latency_ms: record.latencyMs,
    succeeded: record.succeeded,
  });

  // A failed call has no tokens to meter, and a zero-quantity usage row only
  // makes the plan counters harder to read.
  const usageWrite =
    tokens > 0
      ? supabase
          .from('usage_events')
          .insert({ org_id: record.orgId, kind: usageKindFor(record.purpose), quantity: tokens })
      : null;

  const [call, usage] = await Promise.all([callWrite, usageWrite]);

  const failure = call.error ?? usage?.error;
  if (failure) throw new Error(`model usage write failed: ${failure.message}`);
}
