import { z } from 'zod';

import { err, ok, type Result } from '@/lib/result';

import { parseScopeSelection, type ScopeSelection } from './scope-selection';

/**
 * Every call the web app makes into the connection edge functions, with its
 * response parsed here and nowhere else. Only the `functions` surface is needed,
 * so this stays a pure function of its client and is testable without a server.
 *
 * Also the home of the generic invoke helper the dream calls use. It belongs in
 * a shared module once one exists.
 */
export type FunctionsClient = {
  readonly functions: {
    invoke: (
      name: string,
      options: { body: Record<string, unknown> },
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
};

export async function invokeEdgeFunction<T>(
  client: FunctionsClient,
  name: string,
  body: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<Result<T, string>> {
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) return err(`${name} failed: ${error.message}`);

  const parsed = schema.safeParse(data);
  if (!parsed.success) return err(`${name} answered in a shape this app does not understand.`);

  return ok(parsed.data);
}

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

/**
 * A full re-sync re-reads a source from the beginning, which is why it is only
 * ever reached from a button a person pressed.
 *
 * connections-sync runs the pass inline and answers 200 whatever the outcome,
 * because the run happened either way. An outcome other than `synced` is still a
 * failure to the person who pressed the button, so it comes back as one.
 */
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

/**
 * Reads what a connection may read, and saves a choice in the same call. Omit
 * `selected` to refresh the available list without changing the choice.
 *
 * connections is select and delete only for `authenticated`, so this function is
 * the one path that writes scope_selection. It also drops a selected id the
 * provider no longer offers, which is why the answer is what gets rendered
 * rather than what was sent.
 */
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
