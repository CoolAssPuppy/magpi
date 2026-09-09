// POST /dream-run. A person triggering a dream from the space page.
//
// Separate from dream-worker, which is the scheduled drainer and answers only to
// something holding the service role key. A browser cannot hold that key, so the
// two cannot be one function: the difference is not the work, it is who is
// allowed to ask for it.
//
// The run happens inline rather than being queued, because this is also how the
// feature is demonstrated without waiting for a cron, and because the answer a
// user wants is what the run produced. A space large enough to exceed the budget
// comes back as a timeout naming its stage, which is the honest result and the
// one the spec asks to be visible.
//
// Running inline is why the row is created the way start.ts creates it: a run
// nobody else may pick up.

import { ApiError, jsonResponse } from '../_shared/errors.ts';
import { serveFunction } from '../_shared/http.ts';
import { dreamRunSchema, parseBody } from '../_shared/validate.ts';
import { audit, serviceClient } from '../_shared/db.ts';
import { enforceRateLimits } from '../_shared/rate_limit.ts';
import { requireSpaceMembership, requireUser } from '../_shared/auth.ts';
import { runDreamJob } from '../_shared/jobs/dream.ts';
import { jobDepsFromEnv } from '../_shared/jobs/runtime.ts';
import { startManualRun } from './start.ts';

serveFunction('dream-run', async (core) => {
  const input = parseBody(dreamRunSchema, core.body);
  const user = await requireUser(core.headers);
  const db = serviceClient();

  // Dreaming is the most expensive thing this product does, so the per-space
  // budget is tighter than the per-user one.
  await enforceRateLimits(db, [
    { bucket: `dream-run:user:${user.id}`, limit: 20, windowSeconds: 3600 },
    { bucket: `dream-run:space:${input.space_id}`, limit: 10, windowSeconds: 3600 },
  ]);

  const { orgId } = await requireSpaceMembership(db, user.id, input.space_id);

  const { data: space, error: spaceError } = await db
    .from('spaces')
    .select('dreaming_enabled')
    .eq('id', input.space_id)
    .maybeSingle<{ dreaming_enabled: boolean }>();
  if (spaceError) throw new ApiError(500, 'internal', 'the space could not be read');
  // Turning dreaming off has to stop a manual run too, or the switch means
  // nothing to the person who used it.
  if (!space?.dreaming_enabled) {
    throw new ApiError(409, 'dreaming_disabled', 'dreaming is switched off for this space');
  }

  const deps = jobDepsFromEnv();
  const run = await startManualRun(
    db,
    { orgId, spaceId: input.space_id, kind: input.kind, triggeredBy: user.id },
    deps.http.now(),
  );

  audit({
    actor: `user:${user.id}`,
    action: 'dream.run',
    target: run.id,
    ip: core.ip,
    meta: { space_id: input.space_id, kind: input.kind },
  });

  const result = await runDreamJob(run, deps);

  // 200 whatever the outcome. A run that timed out did what it could and the row
  // says so; a non-2xx would tell the page the request failed, which is a
  // different and less useful thing.
  return jsonResponse({
    dream_run_id: run.id,
    status: result.kind === 'succeeded' ? 'succeeded' : result.kind,
    output_document_id: result.kind === 'succeeded' ? result.outputDocumentId : null,
  });
});
