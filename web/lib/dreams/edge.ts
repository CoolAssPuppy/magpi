import { z } from 'zod';

import { invokeEdgeFunction, type FunctionsClient } from '@/lib/connections/edge';
import { ok, type Result } from '@/lib/result';

import type { DreamKind } from './status';

const runResponse = z.object({ dream_run_id: z.uuid() });

/**
 * A run is always one kind over one space. The worker reads only that space and
 * writes only into it, which is the permission model rather than a convenience.
 */
export async function requestDreamRun(
  client: FunctionsClient,
  input: { spaceId: string; kind: DreamKind },
): Promise<Result<{ dreamRunId: string }, string>> {
  const result = await invokeEdgeFunction(
    client,
    'dream-worker',
    { space_id: input.spaceId, kind: input.kind },
    runResponse,
  );

  return result.ok ? ok({ dreamRunId: result.data.dream_run_id }) : result;
}
