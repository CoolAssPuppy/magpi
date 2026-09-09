// POST /token-refresh. Renews provider tokens before a sync needs them.
//
// The sync path renews its own token on the way past, so this exists for the
// case that path does not cover: a connection nobody has synced for a while
// whose refresh token is itself about to be withdrawn. Running it on a schedule
// means an expiry becomes a visible status while someone is awake to see it,
// rather than at the moment a user asks a question.

import { jsonResponse } from '../_shared/errors.ts';
import { serveFunction } from '../_shared/http.ts';
import { parseBody, workerBatchSchema } from '../_shared/validate.ts';
import { claimableConnections } from '../_shared/connections.ts';
import { hasDriver } from '../_shared/sources/index.ts';
import { resolveCredentials } from '../_shared/token_refresh.ts';
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

    const outcome = await resolveCredentials(connection, {
      db: deps.db,
      http: deps.http,
      env: deps.env,
    });

    results.push(
      outcome.kind === 'expired'
        ? { connection_id: connection.id, outcome: 'expired', detail: outcome.detail }
        : {
          connection_id: connection.id,
          outcome: outcome.refreshed ? 'refreshed' : 'ready',
        },
    );
  }

  return jsonResponse({ checked: results.length, results });
});
