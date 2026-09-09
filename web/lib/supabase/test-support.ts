import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import type { SessionContext } from '@/lib/supabase/context';

export type StubResponse = {
  readonly data?: unknown;
  readonly error?: { readonly message: string };
};

/** One link in a chain: the method name, then the arguments it was given. */
export type RecordedCall = readonly [string, ...unknown[]];

export type RecordingContext = {
  readonly context: SessionContext;
  /** Every call made against one table or edge function, in the order they happened. */
  readonly callsFor: (source: string) => readonly RecordedCall[];
};

const CHAIN_METHODS = [
  'select',
  'insert',
  'update',
  'delete',
  'eq',
  'in',
  'order',
  'limit',
  'maybeSingle',
  'single',
];

const READER: Omit<SessionContext, 'supabase'> = {
  userId: '77777777-7777-4777-8777-777777777777',
  email: 'reader@example.com',
  orgId: '99999999-9999-4999-8999-999999999999',
  role: 'member',
};

/**
 * A postgrest and edge function client that records what was asked of it instead
 * of talking to a database. Recording is the point: these modules are the SQL
 * behind a screen, and a test that never looks at the filters cannot tell a
 * query scoped to one space from one that reads the whole table.
 *
 * Rows outside the caller's spaces are absent rather than an error, which is how
 * row level security leaves a table for one reader, so a test spells out what a
 * reader can see by queueing only those rows.
 *
 * The cast is confined to this factory. It is the one place a test double has to
 * stand in for a client whose full surface it does not implement.
 */
export function recordingContext({
  responses,
  session,
}: {
  readonly responses: Readonly<Record<string, readonly StubResponse[]>>;
  readonly session?: Partial<Omit<SessionContext, 'supabase'>>;
}): RecordingContext {
  const calls = new Map<string, RecordedCall[]>();
  const queues = new Map<string, StubResponse[]>(
    Object.entries(responses).map(([source, list]) => [source, [...list]]),
  );

  // Claimed when the query is created rather than when it is awaited, so a
  // reader that issues its queries concurrently still reads them back in the
  // order the source file writes them.
  function claim(source: string, call: RecordedCall): { data: unknown; error: unknown } {
    const recorded = calls.get(source) ?? [];
    recorded.push(call);
    calls.set(source, recorded);

    const next = queues.get(source)?.shift();
    if (!next) throw new Error(`The test queued no response for ${source}`);
    return { data: next.data ?? null, error: next.error ?? null };
  }

  function builderFor(table: string): unknown {
    const settled = claim(table, ['from', table]);
    const recorded = calls.get(table) ?? [];

    const builder: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(settled).then(resolve),
    };

    for (const method of CHAIN_METHODS) {
      builder[method] = (...args: unknown[]) => {
        recorded.push([method, ...args]);
        return builder;
      };
    }

    return builder;
  }

  const supabase = {
    from: (table: string) => builderFor(table),
    functions: {
      invoke: (name: string, options: { body: Record<string, unknown> }) =>
        Promise.resolve(claim(name, ['invoke', name, options.body])),
    },
  } as unknown as SupabaseClient<Database>;

  return {
    context: { ...READER, ...session, supabase },
    callsFor: (source) => calls.get(source) ?? [],
  };
}
