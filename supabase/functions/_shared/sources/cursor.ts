// Where a pass resumes, spelled so the two kinds cannot be mistaken for each
// other.
//
// A cursor is either a watermark, the newest change a finished walk saw, or a
// position part-way through a provider's own pagination. Both live in one text
// column, and writing a pagination token where a watermark is expected is how a
// backlog gets skipped: the next pass reads the newest page again and never
// reaches what is behind it.

import type { SourceDocumentRef } from './contract.ts';
import { asRecord, asString, parseInstant } from './common.ts';

export interface WatermarkCursor {
  kind: 'watermark';
  /** The newest change already read, or null before the first pass. */
  since: string | null;
}

export interface BacklogCursor {
  kind: 'backlog';
  /** The provider's own next-page token, handed straight back to it. */
  page: string;
  /** What the cursor becomes once the pages behind it are read. */
  watermark: string | null;
  /** The watermark the walk began from, which still bounds every request in it. */
  since: string | null;
}

export type SyncCursor = WatermarkCursor | BacklogCursor;

/** Names the encoded shape, so a bare timestamp is never read as a page token. */
const BACKLOG_KIND = 'backlog';

export function parseCursor(value: string | null): SyncCursor {
  const raw = asString(value);
  if (!raw.startsWith('{')) return { kind: 'watermark', since: raw.length > 0 ? raw : null };

  let decoded: unknown = null;
  try {
    decoded = JSON.parse(raw);
  } catch {
    // A cursor nothing can read costs one full pass to rebuild. Throwing here
    // would cost the connection instead, and the column is not worth that.
    return { kind: 'watermark', since: null };
  }

  const record = asRecord(decoded);
  const page = asString(record.page);
  if (asString(record.kind) !== BACKLOG_KIND || page.length === 0) {
    return { kind: 'watermark', since: null };
  }

  return {
    kind: BACKLOG_KIND,
    page,
    watermark: asString(record.watermark) || null,
    since: asString(record.since) || null,
  };
}

export function encodeBacklog(cursor: Omit<BacklogCursor, 'kind'>): string {
  return JSON.stringify({ kind: BACKLOG_KIND, ...cursor });
}

/**
 * The newest stamp among the documents, or `carried` when none of them beats it.
 *
 * Carrying the old watermark is what keeps a quiet connection, or one part-way
 * through a backlog, from rewinding to the beginning of time.
 */
export function newestStamp(
  documents: SourceDocumentRef[],
  carried: string | null,
): string | null {
  let newest = carried;
  let newestMs = parseInstant(carried) ?? Number.NEGATIVE_INFINITY;

  for (const document of documents) {
    const ms = parseInstant(document.updatedAt);
    if (ms !== null && ms > newestMs) {
      newestMs = ms;
      newest = document.updatedAt;
    }
  }
  return newest;
}
