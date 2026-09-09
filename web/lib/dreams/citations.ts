/**
 * A dream output is a claim the product makes without being asked, so every one
 * of them cites the chunks it came from. The worker records those ids in
 * documents.source_chunk_ids, and they are resolved through RLS when the run is
 * read rather than when it is written, the same rule as chat citations.
 */
export type DreamOutput =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'unsourced';
      readonly documentId: string;
      readonly title: string;
      /**
       * `no-citations` should be unreachable: a digest that read nothing writes
       * no document. `sources-unreadable` is the real one, and means every
       * source has been deleted or has left the reader's visible set.
       */
      readonly reason: 'no-citations' | 'sources-unreadable';
    }
  | {
      readonly kind: 'cited';
      readonly documentId: string;
      readonly title: string;
      readonly chunkIds: readonly string[];
    };

/**
 * `visibleChunkIds` is what came back through RLS, so a source the reader cannot
 * open is dropped from the numbering. If that leaves nothing, the run reads as
 * having produced nothing and the prose is never rendered: there is no uncited
 * synthesis, and a claim whose every source is gone is the same thing.
 */
export function describeDreamOutput({
  documentId,
  title,
  sourceChunkIds,
  visibleChunkIds,
}: {
  readonly documentId: string | null;
  readonly title: string | null;
  readonly sourceChunkIds: readonly string[];
  readonly visibleChunkIds: readonly string[];
}): DreamOutput {
  if (!documentId) return { kind: 'none' };

  const resolvedTitle = title ?? 'Untitled';
  if (sourceChunkIds.length === 0) {
    return { kind: 'unsourced', documentId, title: resolvedTitle, reason: 'no-citations' };
  }

  const visible = new Set(visibleChunkIds);
  // Ordered by what the run recorded, not by what the read returned, so the
  // numbering is stable between two readers who can see different amounts.
  const chunkIds = sourceChunkIds.filter((id) => visible.has(id));

  if (chunkIds.length === 0) {
    return { kind: 'unsourced', documentId, title: resolvedTitle, reason: 'sources-unreadable' };
  }

  return { kind: 'cited', documentId, title: resolvedTitle, chunkIds };
}
