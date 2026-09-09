// POST /connections-sync. A person pressing sync on the connections page.
//
// The scheduled path is sync-worker, which walks whatever is due. This is the
// same job body for one named connection, run now, under the caller's own
// identity rather than the scheduler's.
//
// `full` clears the cursor first, which is the deliberate re-read the spec asks
// for: an incremental pass will not notice a document the provider changed
// without changing its timestamp, and that is the only way to pick one up.

import { ApiError, jsonResponse } from '../_shared/errors.ts';
import { serveFunction } from '../_shared/http.ts';
import { connectionsSyncSchema, parseBody } from '../_shared/validate.ts';
import { audit, serviceClient } from '../_shared/db.ts';
import { enforceRateLimits } from '../_shared/rate_limit.ts';
import { requireSpaceMembership, requireUser } from '../_shared/auth.ts';
import { loadConnection } from '../_shared/connections.ts';
import { runSyncJob } from '../_shared/jobs/sync.ts';
import { claimConnectionForSync } from '../_shared/jobs/claim.ts';
import { jobDepsFromEnv } from '../_shared/jobs/runtime.ts';
import { hasDriver } from '../_shared/sources/index.ts';

serveFunction('connections-sync', async (core) => {
  const input = parseBody(connectionsSyncSchema, core.body);
  const user = await requireUser(core.headers);
  const db = serviceClient();

  // A full re-sync re-reads a whole account, so it is rationed harder than the
  // rest of the surface.
  await enforceRateLimits(db, [
    { bucket: `connections-sync:user:${user.id}`, limit: 20, windowSeconds: 600 },
    { bucket: `connections-sync:connection:${input.connection_id}`, limit: 6, windowSeconds: 600 },
  ]);

  const connection = await loadConnection(db, input.connection_id);
  if (!connection) throw new ApiError(404, 'unknown_connection', 'no such connection');
  await requireSpaceMembership(db, user.id, connection.space_id);

  if (!hasDriver(connection.provider)) {
    throw new ApiError(400, 'unknown_provider', `${connection.provider} cannot be synced yet`);
  }

  const deps = jobDepsFromEnv();

  // A double-click, or a press while the scheduled pass is already running, must
  // not become two passes filing the same documents.
  if (!(await claimConnectionForSync(db, connection.id, new Date()))) {
    throw new ApiError(409, 'sync_in_progress', 'this connection is already syncing');
  }

  const result = await runSyncJob(
    { ...connection, cursor: input.full ? null : connection.cursor },
    deps,
  );

  audit({
    actor: `user:${user.id}`,
    action: input.full ? 'connection.resync' : 'connection.sync',
    target: connection.id,
    ip: core.ip,
    meta: { provider: connection.provider, outcome: result.kind },
  });

  // The document count is what the page shows. A pass that found nothing is a
  // success with zero, not a failure.
  return jsonResponse({
    connection_id: connection.id,
    outcome: result.kind,
    job_count: result.kind === 'synced' ? result.enqueued : 0,
    detail: result.kind === 'synced' ? null : describe(result),
  });
});

function describe(result: { kind: string; detail?: string; stage?: string }): string {
  if (typeof result.detail === 'string') return result.detail;
  if (typeof result.stage === 'string') return `${result.stage}: the sync ran out of time`;
  return 'the sync did not complete';
}
