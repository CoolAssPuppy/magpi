// A real Supabase client pointed at a stub PostgREST, so tests can assert the query filters sent.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
  /** The total a counting read asks for. PostgREST sends it in Content-Range, not the body. */
  count?: number;
}

export interface StubDb {
  db: SupabaseClient;
  url: string;
  /** Every request the client made, in order. */
  requests: StubRequest[];
  close(): Promise<void>;
}

/** Starts a stub PostgREST on a free port. A `reply` returning nothing answers with `[]`. */
export function stubDb(reply: (request: StubRequest) => StubReply | undefined): StubDb {
  const requests: StubRequest[] = [];

  const server = Deno.serve({ port: 0, onListen: () => {} }, async (request) => {
    const url = new URL(request.url);
    const raw = await request.text();
    const record: StubRequest = {
      table: url.pathname.replace(/^\/rest\/v1\//, ''),
      method: request.method,
      path: url.pathname,
      query: decodeURIComponent(url.search.replace(/^\?/, '')),
      body: raw ? JSON.parse(raw) : null,
    };
    requests.push(record);

    const answer = reply(record) ?? {};
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (answer.count !== undefined) {
      headers['content-range'] = `0-${Math.max(answer.count - 1, 0)}/${answer.count}`;
    }
    return new Response(JSON.stringify(answer.body ?? []), {
      status: answer.status ?? 200,
      headers,
    });
  });

  const { port } = server.addr as Deno.NetAddr;
  const url = `http://127.0.0.1:${port}`;
  const db = createClient(url, 'stub-key', {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { db, url, requests, close: () => server.shutdown() };
}

/** The requests made against one table, for asserting what a read asked for. */
export function requestsFor(stub: StubDb, table: string): StubRequest[] {
  return stub.requests.filter((request) => request.table === table);
}
