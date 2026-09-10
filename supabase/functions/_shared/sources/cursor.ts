// Where a pass resumes: a watermark, or a position part-way through provider pagination.

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
    // An unreadable cursor rebuilds over one full pass rather than failing the connection.
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

/** The newest stamp among the documents, or `carried` when none of them beats it. */
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
