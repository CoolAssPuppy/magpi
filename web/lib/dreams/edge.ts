import { z } from 'zod';

import { invokeEdgeFunction, type FunctionsClient } from '@/lib/edge/invoke';
import { ok, type Result } from '@/lib/result';

import type { DreamKind } from './status';

/**
 * dream-run answers 200 for a timeout as well as a success, because the run
 * happened either way and the row records how it ended. Only a request that
 * never ran is an error here, which is why `status` is narrowed to the three
 * terminal states: a run still queued or running would mean the function did not
 * do what it says it does.
 */
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

/**
 * A run is always one kind over one space. The worker reads only that space and
 * writes only into it, which is the permission model rather than a convenience.
 *
 * dream-worker is the scheduled drainer and answers only to the service role, so
 * a browser calling it gets a 403. This is the one a person can reach.
 */
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
