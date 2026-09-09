// POST /sync-worker. Runs one incremental pass over each connection due for one.

import { jsonResponse } from '../_shared/errors.ts';
import { serveFunction } from '../_shared/http.ts';
import { parseBody, workerBatchSchema } from '../_shared/validate.ts';
import { claimableConnections } from '../_shared/connections.ts';
import { hasDriver } from '../_shared/sources/index.ts';
import { runSyncJob, type SyncResult } from '../_shared/jobs/sync.ts';
import { jobDepsFromEnv, requireWorkerCaller } from '../_shared/jobs/runtime.ts';

const DEFAULT_BATCH = 5;

serveFunction('sync-worker', async (core) => {
  requireWorkerCaller(core.headers);
  const input = parseBody(workerBatchSchema, core.body ?? {});
  const deps = jobDepsFromEnv();

  const connections = await claimableConnections(deps.db, input.batch ?? DEFAULT_BATCH);

  const results: (SyncResult & { connection_id: string })[] = [];
  for (const connection of connections) {
    // A registry row can exist before its driver is deployed. Skipping is right;
    // failing the batch on it is not.
    if (!hasDriver(connection.provider)) continue;
    results.push({ connection_id: connection.id, ...(await runSyncJob(connection, deps)) });
  }

  return jsonResponse({ claimed: results.length, results });
});
