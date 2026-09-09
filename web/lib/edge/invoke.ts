import type { z } from 'zod';

import { err, ok, type Result } from '@/lib/result';

/**
 * The one call the web app makes into an Edge Function, with the response
 * parsed here and nowhere else. Only the `functions` surface is needed, so this
 * stays a pure function of its client and is testable without a server.
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
