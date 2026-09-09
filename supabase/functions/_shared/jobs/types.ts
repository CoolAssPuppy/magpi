// What a job body is handed.
//
// A job body is a plain async function taking a record and this set of injected
// clients. No Deno.serve, no global fetch, no env read at call time. The runtime
// entry point is a thin wrapper that builds these from the environment once, so
// moving off Edge Functions is a wrapper change rather than a rewrite, and a
// test runs the body directly with no server.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { EnvSource } from '../env.ts';
import type { ModelRunner } from '../model_client.ts';
import type { SourceDeps } from '../sources/contract.ts';

/** Where an uploaded file's bytes come from. Separate so a test needs no bucket. */
export interface UploadStore {
  read(storagePath: string): Promise<Uint8Array>;
}

export interface JobDeps {
  /** Service role. These functions are the privileged path and check their own scope. */
  db: SupabaseClient;
  /** fetch and the clock, shared with the source drivers. */
  http: SourceDeps;
  models: ModelRunner;
  uploads: UploadStore;
  env?: EnvSource;
  /** Overridden in tests to prove the timeout path without waiting for it. */
  budgetMs?: number;
}

export type IngestStage = 'fetch' | 'extract' | 'chunk' | 'embed' | 'store';

/**
 * A row in usage_events, written when a job does the thing a plan meters.
 *
 * Usage is recorded as it happens rather than computed by scanning documents on
 * a page load, which is what keeps the admin page cheap at four thousand seats.
 */
export interface UsageEvent {
  orgId: string;
  kind:
    | 'document_ingested'
    | 'chunk_embedded'
    | 'query'
    | 'dream_run'
    | 'embedding_tokens'
    | 'chat_tokens'
    | 'storage_bytes';
  quantity: number;
}

export async function recordUsage(db: SupabaseClient, events: UsageEvent[]): Promise<void> {
  if (events.length === 0) return;
  const { error } = await db.from('usage_events').insert(
    events.map((event) => ({ org_id: event.orgId, kind: event.kind, quantity: event.quantity })),
  );
  // Metering is not worth failing finished work over; the log is where a gap in
  // the numbers gets noticed.
  if (error) console.error('usage events could not be written', error.message);
}
