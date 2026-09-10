// POST /token-refresh. Renews provider tokens for connections the sync path has not touched lately.

import { jsonResponse } from '../_shared/errors.ts';
import { serveFunction } from '../_shared/http.ts';
import { parseBody, workerBatchSchema } from '../_shared/validate.ts';
import { claimableConnections } from '../_shared/connections.ts';
import { hasDriver } from '../_shared/sources/index.ts';
import { refreshIfSpent } from '../_shared/token_refresh.ts';
import { jobDepsFromEnv, requireWorkerCaller } from '../_shared/jobs/runtime.ts';

const DEFAULT_BATCH = 20;

interface RefreshReport {
  connection_id: string;
  outcome: 'ready' | 'refreshed' | 'expired';
  detail?: string;
}

serveFunction('token-refresh', async (core) => {
  requireWorkerCaller(core.headers);
  const input = parseBody(workerBatchSchema, core.body ?? {});
  const deps = jobDepsFromEnv();

  const connections = await claimableConnections(deps.db, input.batch ?? DEFAULT_BATCH);

  const results: RefreshReport[] = [];
  for (const connection of connections) {
    if (!hasDriver(connection.provider)) continue;

    // refreshIfSpent rather than resolveCredentials: this pass reports rather than reads.
    const summary = await refreshIfSpent(connection, {
      db: deps.db,
      http: deps.http,
      env: deps.env,
    });

    results.push(
      summary.kind === 'expired'
        ? { connection_id: connection.id, outcome: 'expired', detail: summary.detail }
        : {
          connection_id: connection.id,
          outcome: summary.kind === 'refreshed' ? 'refreshed' : 'ready',
        },
    );
  }

  return jsonResponse({ checked: results.length, results });
});
