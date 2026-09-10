// One incremental pass over one connection: file changed documents, queue an ingest job for each.

import type { SupabaseClient } from '@supabase/supabase-js';

import { advanceCursor, type ConnectionRow, markConnectionStatus } from '../connections.ts';
import { ApiError } from '../errors.ts';
import { SourceError } from '../sources/contract.ts';
import type { SourceDocumentRef } from '../sources/contract.ts';
import { driverFor } from '../sources/index.ts';
import { resolveCredentials } from '../token_refresh.ts';
import { DEFAULT_BUDGET_MS, StageTimeout, startBudget } from './budget.ts';
import type { JobDeps } from './types.ts';

export type SyncResult =
  | {
    kind: 'synced';
    documentCount: number;
    enqueued: number;
    cursor: string | null;
    hasMore: boolean;
  }
  | { kind: 'expired'; detail: string }
  | { kind: 'timeout'; stage: string }
  | { kind: 'failed'; detail: string };

/** How many pages of changes one run will ask a driver for. Guard behind the time budget. */
const MAX_PASSES = 20;

interface ExistingDocument {
  id: string;
  external_id: string;
  /** Read back so a pass can tell a document that moved from one that did not. */
  title: string;
  url: string | null;
}

const FILED_COLUMNS = 'id, external_id, title, url';

/** Documents this connection has already filed, for the external ids in this page. */
async function existingDocuments(
  db: SupabaseClient,
  connectionId: string,
  externalIds: string[],
): Promise<Map<string, ExistingDocument>> {
  if (externalIds.length === 0) return new Map();

  const { data, error } = await db
    .from('documents')
    .select(FILED_COLUMNS)
    .eq('connection_id', connectionId)
    .in('external_id', externalIds)
    .returns<ExistingDocument[]>();
  if (error) throw new ApiError(500, 'internal', 'document lookup failed');

  return new Map((data ?? []).map((row) => [row.external_id, row]));
}

/** Writes back only the documents whose title or url the provider changed, in one upsert. */
async function relabelDocuments(
  deps: JobDeps,
  connection: ConnectionRow,
  refs: SourceDocumentRef[],
  known: Map<string, ExistingDocument>,
): Promise<void> {
  // Keyed by id so a page naming a document twice does not write the same row twice.
  const moved = new Map<string, Record<string, unknown>>();
  for (const ref of refs) {
    const row = known.get(ref.externalId);
    if (!row || (row.title === ref.title && row.url === (ref.url ?? null))) continue;
    moved.set(row.id, {
      id: row.id,
      org_id: connection.org_id,
      space_id: connection.space_id,
      connection_id: connection.id,
      external_id: ref.externalId,
      title: ref.title,
      url: ref.url,
      // Not null, so the upsert has to name it. Sync is the only writer of these rows.
      origin: 'sync',
    });
  }
  if (moved.size === 0) return;

  const { error } = await deps.db
    .from('documents')
    .upsert([...moved.values()], { onConflict: 'id' });
  if (error) throw new ApiError(500, 'internal', 'the renamed documents could not be filed');
}

/** Files changed documents, returning row ids in order. A partial unique index rules out upsert. */
async function fileDocuments(
  deps: JobDeps,
  connection: ConnectionRow,
  refs: SourceDocumentRef[],
): Promise<string[]> {
  const known = await existingDocuments(
    deps.db,
    connection.id,
    refs.map((ref) => ref.externalId),
  );

  const fresh = refs.filter((ref) => !known.has(ref.externalId));
  if (fresh.length > 0) {
    const { data, error } = await deps.db
      .from('documents')
      .insert(
        fresh.map((ref) => ({
          org_id: connection.org_id,
          space_id: connection.space_id,
          connection_id: connection.id,
          external_id: ref.externalId,
          title: ref.title,
          url: ref.url,
          mime_type: ref.mimeType,
          origin: 'sync',
        })),
      )
      .select(FILED_COLUMNS)
      .returns<ExistingDocument[]>();
    if (error) throw new ApiError(500, 'internal', 'the changed documents could not be filed');
    for (const row of data ?? []) known.set(row.external_id, row);
  }

  // Only rows a previous pass filed can look renamed, so this walks those.
  await relabelDocuments(deps, connection, refs, known);

  return refs
    .map((ref) => known.get(ref.externalId)?.id)
    .filter((id): id is string => typeof id === 'string');
}

async function enqueueIngest(
  deps: JobDeps,
  connection: ConnectionRow,
  documentIds: string[],
): Promise<number> {
  if (documentIds.length === 0) return 0;

  const { error } = await deps.db.from('ingest_jobs').insert(
    documentIds.map((documentId) => ({
      org_id: connection.org_id,
      space_id: connection.space_id,
      document_id: documentId,
      connection_id: connection.id,
      status: 'queued',
      stage: 'fetch',
    })),
  );
  if (error) throw new ApiError(500, 'internal', 'the ingest jobs could not be queued');
  return documentIds.length;
}

export async function runSyncJob(connection: ConnectionRow, deps: JobDeps): Promise<SyncResult> {
  const budget = startBudget(deps.http, deps.budgetMs ?? DEFAULT_BUDGET_MS);

  let cursor = connection.cursor;
  let documentCount = 0;
  let enqueued = 0;
  let walked = 0;
  let hasMore = false;

  try {
    budget.checkpoint('credentials');
    const outcome = await resolveCredentials(connection, {
      db: deps.db,
      http: deps.http,
      env: deps.env,
    });
    // resolveCredentials has already written the reason onto the row.
    if (outcome.kind === 'expired') return { kind: 'expired', detail: outcome.detail };

    // Both callers already claimed the row as syncing before this body runs.
    const driver = driverFor(connection.provider);

    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const from = cursor;

      budget.checkpoint('list');
      const page = await driver.listChanges(outcome.credentials, deps.http, { cursor: from });

      budget.checkpoint('file');
      const documentIds = await fileDocuments(deps, connection, page.documents);

      budget.checkpoint('enqueue');
      enqueued += await enqueueIngest(deps, connection, documentIds);
      documentCount += page.documents.length;

      // Advance the cursor only after the ingest jobs exist, or documents get skipped.
      await advanceCursor(deps.db, connection.id, page.cursor, deps.http.now());

      cursor = page.cursor;
      hasMore = page.hasMore;
      walked += 1;

      if (!hasMore) break;
      // A driver can report more without moving the cursor; leave the rest to the next run.
      if (page.cursor === from) break;
      if (budget.isSpent()) break;
    }

    return { kind: 'synced', documentCount, enqueued, cursor, hasMore };
  } catch (err) {
    if (err instanceof StageTimeout) {
      // A run that filed pages before the timeout reports progress rather than an error.
      if (walked > 0) {
        return { kind: 'synced', documentCount, enqueued, cursor, hasMore: true };
      }
      await markConnectionStatus(deps.db, connection.id, 'error', err.message);
      return { kind: 'timeout', stage: err.stage };
    }

    if (err instanceof SourceError) {
      // A refused credential marks the connection expired; any other error marks it error.
      await markConnectionStatus(
        deps.db,
        connection.id,
        err.needsReconnect ? 'expired' : 'error',
        err.message,
      );
      return { kind: 'failed', detail: err.message };
    }

    const detail = err instanceof ApiError ? err.message : 'the sync failed unexpectedly';
    if (!(err instanceof ApiError)) console.error('sync job failed unexpectedly', err);
    await markConnectionStatus(deps.db, connection.id, 'error', detail);
    return { kind: 'failed', detail };
  }
}
