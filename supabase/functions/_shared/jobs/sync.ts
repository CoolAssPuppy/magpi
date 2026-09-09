// One incremental pass over one connection.
//
// Sync does not read document text. It asks the driver what changed, files a
// documents row per change, and queues an ingest job for each. Keeping the two
// apart is what stops one enormous document from taking the whole pass down with
// it: the sync succeeds, and the document that could not be read is one failed
// ingest job the admin page can name.

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

/**
 * How many times one run will ask a driver for another page of changes.
 *
 * The wall-clock budget is the real limit and this is the guard behind it: a
 * driver that answers `hasMore` forever would otherwise spend the whole budget
 * on one connection, and in a test with a fixed clock it would never stop at
 * all. Twenty passes over four drivers that each cap their own requests is far
 * more than any budget affords.
 */
const MAX_PASSES = 20;

interface ExistingDocument {
  id: string;
  external_id: string;
}

/** Documents this connection has already filed, for the external ids in this page. */
async function existingDocuments(
  db: SupabaseClient,
  connectionId: string,
  externalIds: string[],
): Promise<Map<string, string>> {
  if (externalIds.length === 0) return new Map();

  const { data, error } = await db
    .from('documents')
    .select('id, external_id')
    .eq('connection_id', connectionId)
    .in('external_id', externalIds)
    .returns<ExistingDocument[]>();
  if (error) throw new ApiError(500, 'internal', 'document lookup failed');

  return new Map((data ?? []).map((row) => [row.external_id, row.id]));
}

/**
 * Files each changed document, returning the row ids in the same order.
 *
 * The unique index on (connection_id, external_id) is partial, so it cannot be
 * named in an on-conflict clause. Reading first and then inserting only what is
 * missing does the same job in two round trips for a whole page rather than one
 * per document.
 */
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
      .select('id, external_id')
      .returns<ExistingDocument[]>();
    if (error) throw new ApiError(500, 'internal', 'the changed documents could not be filed');
    for (const row of data ?? []) known.set(row.external_id, row.id);
  }

  // A document the provider renamed keeps its row and its chunks; only the
  // label moves. Re-reading its text is the ingest job's business.
  for (const ref of refs) {
    const id = known.get(ref.externalId);
    if (!id || fresh.includes(ref)) continue;
    await deps.db
      .from('documents')
      .update({ title: ref.title, url: ref.url })
      .eq('id', id);
  }

  return refs
    .map((ref) => known.get(ref.externalId))
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
    // resolveCredentials has already written the reason onto the row, so the
    // connections page can say what to do about it.
    if (outcome.kind === 'expired') return { kind: 'expired', detail: outcome.detail };

    await markConnectionStatus(deps.db, connection.id, 'syncing', null);
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

      // The cursor advances only after the jobs exist. Advancing first and then
      // failing to queue would skip those documents for good.
      await advanceCursor(deps.db, connection.id, page.cursor, deps.http.now());

      cursor = page.cursor;
      hasMore = page.hasMore;
      walked += 1;

      if (!hasMore) break;
      // A driver can report more without having moved: Slack reads a fixed
      // number of channels per pass and leaves the cursor alone when they were
      // all quiet. Asking again would read the same channels until the budget
      // went, so the rest of that backlog is the next run's.
      if (page.cursor === from) break;
      if (budget.isSpent()) break;
    }

    return { kind: 'synced', documentCount, enqueued, cursor, hasMore };
  } catch (err) {
    if (err instanceof StageTimeout) {
      // A run that filed pages before the clock ran out is behind, not broken.
      // The cursor it wrote is durable and the next run resumes from it, so
      // marking the connection with an error would put a fault on a row that
      // did exactly what it could.
      if (walked > 0) {
        return { kind: 'synced', documentCount, enqueued, cursor, hasMore: true };
      }
      await markConnectionStatus(deps.db, connection.id, 'error', err.message);
      return { kind: 'timeout', stage: err.stage };
    }

    if (err instanceof SourceError) {
      // A refused credential is a different state from a provider having a bad
      // minute: one needs the user, the other needs the next pass.
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
