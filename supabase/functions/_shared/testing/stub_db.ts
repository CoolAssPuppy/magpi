// A real Supabase client pointed at a stub PostgREST, for tests.
//
// Test-only. Nothing under a function entry point imports it, so it is never
// bundled into a deployment.
//
// A hand-written fake client cannot be built without asserting an object into a
// type it does not have. This is better anyway: the query actually goes over the
// wire, so a test can assert the filters that scope a read to one space. A fake
// would happily accept a query that forgot space_id and pass.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface StubRequest {
  /** The table, taken from the PostgREST path. An rpc reads as `rpc/<name>`. */
  table: string;
  method: string;
  path: string;
  /** Decoded query string, so `space_id=eq.abc` reads as written. */
  query: string;
  body: unknown;
}

export interface StubReply {
  /** What PostgREST would return. An array for a select, or anything else. */
  body?: unknown;
  status?: number;
}

export interface StubDb {
  db: SupabaseClient;
  url: string;
  /** Every request the client made, in order. */
  requests: StubRequest[];
  close(): Promise<void>;
}

/**
 * Starts a stub PostgREST on a free port and returns a client bound to it.
 *
 * `reply` is asked for a response per request. Returning nothing answers with an
 * empty array, which is what an unmatched select should look like.
 */
export function stubDb(reply: (request: StubRequest) => StubReply | undefined): StubDb {
  const requests: StubRequest[] = [];

  const server = Deno.serve({ port: 0, onListen: () => {} }, async (request) => {
    const url = new URL(request.url);
    const raw = await request.text();
    const record: StubRequest = {
      table: url.pathname.replace(/^\/rest\/v1\//, ""),
      method: request.method,
      path: url.pathname,
      query: decodeURIComponent(url.search.replace(/^\?/, "")),
      body: raw ? JSON.parse(raw) : null,
    };
    requests.push(record);

    const answer = reply(record) ?? {};
    return new Response(JSON.stringify(answer.body ?? []), {
      status: answer.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });

  const { port } = server.addr as Deno.NetAddr;
  const url = `http://127.0.0.1:${port}`;
  const db = createClient(url, "stub-key", {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { db, url, requests, close: () => server.shutdown() };
}

/** The requests made against one table, for asserting what a read asked for. */
export function requestsFor(stub: StubDb, table: string): StubRequest[] {
  return stub.requests.filter((request) => request.table === table);
}
