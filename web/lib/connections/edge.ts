import { z } from 'zod';

import { invokeEdgeFunction, type FunctionsClient } from '@/lib/edge/invoke';
import { err, ok, type Result } from '@/lib/result';

import { parseScopeSelection, type ScopeSelection } from './scope-selection';

/** Every call the web app makes into the connection edge functions. */
const beginResponse = z.object({ authorize_url: z.url() });
const claimResponse = z.object({ connection_id: z.uuid() });
const syncResponse = z.object({
  outcome: z.enum(['synced', 'expired', 'timeout', 'failed']),
  job_count: z.number().int().nonnegative(),
  detail: z.string().nullable(),
});
const scopesResponse = z.object({ scope_selection: z.unknown() });

export async function beginConnection(
  client: FunctionsClient,
  input: { provider: string; spaceId: string; returnTo: string },
): Promise<Result<{ authorizeUrl: string }, string>> {
  const result = await invokeEdgeFunction(
    client,
    'connections-begin',
    { provider: input.provider, space_id: input.spaceId, return_to: input.returnTo },
    beginResponse,
  );

  return result.ok ? ok({ authorizeUrl: result.data.authorize_url }) : result;
}

export async function claimConnection(
  client: FunctionsClient,
  input: { ticket: string },
): Promise<Result<{ connectionId: string }, string>> {
  const result = await invokeEdgeFunction(
    client,
    'connections-claim',
    { ticket: input.ticket },
    claimResponse,
  );

  return result.ok ? ok({ connectionId: result.data.connection_id }) : result;
}

/** Re-reads a source from the beginning. An outcome other than `synced` comes back as an error. */
export async function requestFullSync(
  client: FunctionsClient,
  input: { connectionId: string },
): Promise<Result<{ jobCount: number }, string>> {
  const result = await invokeEdgeFunction(
    client,
    'connections-sync',
    { connection_id: input.connectionId, full: true },
    syncResponse,
  );
  if (!result.ok) return result;

  if (result.data.outcome !== 'synced') {
    return err(result.data.detail ?? `The sync ended in ${result.data.outcome}.`);
  }

  return ok({ jobCount: result.data.job_count });
}

/** Reads and saves what a connection may read. Omit `selected` to refresh the list only. */
export async function requestScopes(
  client: FunctionsClient,
  input: { connectionId: string; selected?: readonly string[] },
): Promise<Result<ScopeSelection, string>> {
  const body: Record<string, unknown> = { connection_id: input.connectionId };
  if (input.selected) body.selected = [...input.selected];

  const result = await invokeEdgeFunction(client, 'connections-scopes', body, scopesResponse);
  if (!result.ok) return result;

  return parseScopeSelection(result.data.scope_selection);
}
