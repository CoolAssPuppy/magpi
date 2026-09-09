// One document, end to end: fetch, extract, chunk, embed, store.
//
// A plain async function taking a job record and a set of injected clients. No
// Deno.serve, no global fetch, no env read at call time, so a test runs it
// directly and moving off Edge Functions is a wrapper change.
//
// Deliberately not batched into artificially small units to dodge the platform
// ceiling. A single document import is one job. When the document is large
// enough the budget runs out, and the job says which stage it died in rather
// than leaving a spinner that never resolves.

import type { SupabaseClient } from '@supabase/supabase-js';

import { sha256Hex } from '../crypto.ts';
import { loadConnection } from '../connections.ts';
import { chunkText } from '../chunking.ts';
import { extractText } from '../extract.ts';
import { ApiError } from '../errors.ts';
import { SourceError } from '../sources/contract.ts';
import { driverFor } from '../sources/index.ts';
import { resolveCredentials } from '../token_refresh.ts';
import { type Budget, DEFAULT_BUDGET_MS, StageTimeout, startBudget } from './budget.ts';
import { type IngestStage, type JobDeps, recordUsage } from './types.ts';

/**
 * How many chunks are embedded per call.
 *
 * One request per chunk spends the whole budget on round trips; one request for
 * a whole book is refused by the model. Sixty-four is where a normal document
 * takes one call and a large one takes a handful, each cheap enough to check the
 * budget between.
 */
const EMBED_BATCH = 64;

export interface IngestJobRecord {
  id: string;
  org_id: string;
  space_id: string;
  document_id: string;
  connection_id: string | null;
}

export type IngestResult =
  | { kind: 'succeeded'; chunkCount: number }
  | { kind: 'unchanged' }
  | { kind: 'timeout'; stage: IngestStage }
  | { kind: 'retrying'; stage: IngestStage; detail: string }
  | { kind: 'failed'; stage: IngestStage; detail: string };

interface DocumentRow {
  id: string;
  org_id: string;
  space_id: string;
  connection_id: string | null;
  external_id: string | null;
  title: string;
  url: string | null;
  mime_type: string | null;
  storage_path: string | null;
  content_hash: string | null;
  version: number;
  size_bytes: number | null;
}

const DOCUMENT_COLUMNS =
  'id, org_id, space_id, connection_id, external_id, title, url, mime_type, storage_path, content_hash, version, size_bytes';

interface SourceText {
  text: string;
  mimeType: string;
  title: string;
  url: string | null;
  /**
   * What the document weighs: the uploaded file for an upload, the fetched text
   * for a synced document, which occupies no bucket at all.
   */
  sizeBytes: number;
  /** Only an upload consumes Storage, and only Storage is worth metering. */
  occupiesStorage: boolean;
}

async function loadDocument(db: SupabaseClient, documentId: string): Promise<DocumentRow> {
  const { data, error } = await db
    .from('documents')
    .select(DOCUMENT_COLUMNS)
    .eq('id', documentId)
    .maybeSingle<DocumentRow>();
  if (error) throw new ApiError(500, 'internal', 'document lookup failed');
  if (!data) throw new ApiError(404, 'unknown_document', 'that document no longer exists');
  return data;
}

/** Progress the browser watches through Realtime, so a stalled stage is visible. */
async function enterStage(
  deps: JobDeps,
  job: IngestJobRecord,
  stage: IngestStage,
  budget: Budget,
): Promise<void> {
  budget.checkpoint(stage);
  await deps.db.from('ingest_jobs').update({ stage, status: 'running' }).eq('id', job.id);
}

/**
 * An uploaded file's bytes, or a source document's text.
 *
 * The two paths converge here because everything after extraction is identical,
 * which is the only reason four providers and a dropzone can share one job body.
 */
async function readSource(document: DocumentRow, deps: JobDeps): Promise<SourceText> {
  if (document.storage_path) {
    const bytes = await deps.uploads.read(document.storage_path);
    const extracted = await extractText({
      bytes,
      mimeType: document.mime_type ?? 'text/plain',
    });
    return {
      text: extracted.text,
      mimeType: extracted.mimeType,
      title: document.title,
      url: document.url,
      sizeBytes: bytes.byteLength,
      occupiesStorage: true,
    };
  }

  if (!document.connection_id || !document.external_id) {
    throw new ApiError(
      422,
      'unreadable_document',
      'that document has neither uploaded bytes nor a source to fetch from',
    );
  }

  const connection = await loadConnection(deps.db, document.connection_id);
  if (!connection) {
    throw new ApiError(409, 'connection_gone', 'the source connection has been removed');
  }

  const outcome = await resolveCredentials(connection, {
    db: deps.db,
    http: deps.http,
    env: deps.env,
  });
  if (outcome.kind === 'expired') {
    throw new SourceError(connection.provider, outcome.detail, true);
  }

  const fetched = await driverFor(connection.provider).fetchDocument(
    outcome.credentials,
    deps.http,
    document.external_id,
  );

  return {
    text: fetched.text,
    mimeType: fetched.mimeType,
    title: fetched.title,
    url: fetched.url,
    sizeBytes: new TextEncoder().encode(fetched.text).byteLength,
    occupiesStorage: false,
  };
}

async function storeChunks(
  deps: JobDeps,
  document: DocumentRow,
  chunks: { ordinal: number; content: string; tokenCount: number }[],
  embeddings: number[][],
): Promise<void> {
  // A re-ingest replaces the document's chunks rather than adding to them, or a
  // second pass doubles every answer the document can give.
  const { error: clearError } = await deps.db
    .from('chunks')
    .delete()
    .eq('document_id', document.id);
  if (clearError) throw new ApiError(500, 'internal', 'the old chunks could not be cleared');

  if (chunks.length > 0) {
    const { error } = await deps.db.from('chunks').insert(
      chunks.map((chunk, index) => ({
        org_id: document.org_id,
        space_id: document.space_id,
        document_id: document.id,
        ordinal: chunk.ordinal,
        content: chunk.content,
        token_count: chunk.tokenCount,
        embedding: embeddings[index],
      })),
    );
    if (error) throw new ApiError(500, 'internal', 'the chunks could not be stored');
  }
}

async function finish(
  deps: JobDeps,
  job: IngestJobRecord,
  patch: { status: string; stage: IngestStage; error: string | null },
): Promise<void> {
  await deps.db.from('ingest_jobs').update(patch).eq('id', job.id);
}

function detailOf(err: unknown): string {
  // A SourceError message is written for a person to read and carries nothing
  // the provider sent. An ApiError message is ours. Anything else is a bug, and
  // its text belongs in the log rather than on a user's screen.
  if (err instanceof SourceError) return err.message;
  if (err instanceof ApiError) return err.message;
  console.error('ingest job failed unexpectedly', err);
  return 'the import failed unexpectedly';
}

export async function runIngestJob(job: IngestJobRecord, deps: JobDeps): Promise<IngestResult> {
  const budget = startBudget(deps.http, deps.budgetMs ?? DEFAULT_BUDGET_MS);
  // The caller claimed this row and set status, claimed_at and attempts in the
  // same statement it selected it. Writing them again here would overwrite the
  // claim time with a later one, which is the number that says how long a job
  // has been held.
  let stage: IngestStage = 'fetch';

  try {
    const document = await loadDocument(deps.db, job.document_id);
    const source = await readSource(document, deps);

    stage = 'extract';
    await enterStage(deps, job, stage, budget);
    const contentHash = await sha256Hex(source.text);

    // Re-embedding text that has not changed spends the budget and the model
    // bill to arrive at the same vectors. Sync calls this on every pass.
    if (document.content_hash === contentHash) {
      await finish(deps, job, { status: 'succeeded', stage: 'store', error: null });
      return { kind: 'unchanged' };
    }

    stage = 'chunk';
    await enterStage(deps, job, stage, budget);
    const chunks = chunkText(source.text);

    stage = 'embed';
    await enterStage(deps, job, stage, budget);
    const embeddings: number[][] = [];
    for (let start = 0; start < chunks.length; start += EMBED_BATCH) {
      budget.checkpoint(stage);
      const batch = chunks.slice(start, start + EMBED_BATCH);
      embeddings.push(
        ...(await deps.models.embed({
          orgId: document.org_id,
          texts: batch.map((chunk) => chunk.content),
        })),
      );
    }

    stage = 'store';
    await enterStage(deps, job, stage, budget);
    await storeChunks(deps, document, chunks, embeddings);

    const { error: documentError } = await deps.db
      .from('documents')
      .update({
        content_hash: contentHash,
        version: document.version + 1,
        title: source.title,
        url: source.url,
        mime_type: source.mimeType,
        size_bytes: source.sizeBytes,
      })
      .eq('id', document.id);
    if (documentError) throw new ApiError(500, 'internal', 'the document could not be updated');

    await recordUsage(deps.db, [
      { orgId: document.org_id, kind: 'document_ingested', quantity: 1 },
      { orgId: document.org_id, kind: 'chunk_embedded', quantity: chunks.length },
      // The delta, not the size. The admin page sums these events and never
      // scans documents, so a re-import that grew a file by a kilobyte has to
      // add a kilobyte rather than the whole file a second time.
      ...(source.occupiesStorage
        ? [{
          orgId: document.org_id,
          kind: 'storage_bytes' as const,
          quantity: source.sizeBytes - (document.size_bytes ?? 0),
        }]
        : []),
    ]);

    await finish(deps, job, { status: 'succeeded', stage: 'store', error: null });
    return { kind: 'succeeded', chunkCount: chunks.length };
  } catch (err) {
    if (err instanceof StageTimeout) {
      // The stage is the point. A user who imported a four hundred page pdf can
      // see it died embedding rather than that something went wrong.
      await finish(deps, job, { status: 'timeout', stage, error: err.message });
      return { kind: 'timeout', stage };
    }

    const detail = detailOf(err);

    // A provider that failed for the moment is not a document that cannot be
    // imported, and the driver's message says as much to the user. Writing a
    // terminal status here makes that message false and leaves the three
    // attempts claim_ingest_jobs budgets for with no path that reaches them.
    // Back on the queue, where the attempt cap retires it if the moment lasts.
    //
    // A refused credential is the other half: retrying it spends three more
    // round trips to be refused three more times, and reconnecting is the fix.
    if (err instanceof SourceError && !err.needsReconnect) {
      await finish(deps, job, { status: 'queued', stage, error: detail });
      return { kind: 'retrying', stage, detail };
    }

    await finish(deps, job, { status: 'failed', stage, error: detail });
    return { kind: 'failed', stage, detail };
  }
}
