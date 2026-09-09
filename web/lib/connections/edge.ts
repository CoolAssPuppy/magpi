import { z } from 'zod';

import { err, ok, type Result } from '@/lib/result';

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
const syncResponse = z.object({ job_count: z.number().int().nonnegative() });

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
 * A full re-sync re-reads the source from the beginning and ignores the cursor,
 * which is why it is only ever reached from a button a person pressed.
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

  return result.ok ? ok({ jobCount: result.data.job_count }) : result;
}
