import { z } from 'zod';

import { invokeEdgeFunction, type FunctionsClient } from '@/lib/edge/invoke';
import { ok, type Result } from '@/lib/result';

import type { DreamKind } from './status';

/** dream-run answers 200 for a timeout too, so only the three terminal states are accepted. */
const runResponse = z.object({
  dream_run_id: z.uuid(),
  status: z.enum(['succeeded', 'failed', 'timeout']),
  output_document_id: z.uuid().nullable(),
});

export type DreamRunOutcome = {
  readonly dreamRunId: string;
  readonly status: 'succeeded' | 'failed' | 'timeout';
  readonly outputDocumentId: string | null;
};

/** One kind over one space. The function a person can reach; dream-worker is service role only. */
export async function requestDreamRun(
  client: FunctionsClient,
  input: { spaceId: string; kind: DreamKind },
): Promise<Result<DreamRunOutcome, string>> {
  const result = await invokeEdgeFunction(
    client,
    'dream-run',
    { space_id: input.spaceId, kind: input.kind },
    runResponse,
  );
  if (!result.ok) return result;

  return ok({
    dreamRunId: result.data.dream_run_id,
    status: result.data.status,
    outputDocumentId: result.data.output_document_id,
  });
}
