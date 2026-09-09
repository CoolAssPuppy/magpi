/**
 * A dream output is a claim the product makes without being asked, so every one
 * of them cites the chunks it came from. The worker records those ids in
 * documents.source_chunk_ids, and they are resolved through RLS when the run is
 * read rather than when it is written, the same rule as chat citations.
 */
export type DreamOutput =
  | { readonly kind: 'none' }
  /**
   * The run cited nothing. A fact about the run, and it should be unreachable:
   * a digest that read zero chunks writes no document at all.
   */
  | { readonly kind: 'uncited'; readonly documentId: string; readonly title: string }
  /**
   * The run cited sources this reader cannot open. A fact about the reader, not
   * about the run, and it has to read as one: a reader told only "no sources"
   * concludes the synthesis was invented.
   */
  | {
      readonly kind: 'sources-hidden';
      readonly documentId: string;
      readonly title: string;
      readonly citedCount: number;
    }
  | {
      readonly kind: 'cited';
      readonly documentId: string;
      readonly title: string;
      readonly chunkIds: readonly string[];
    };

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
    return { kind: 'uncited', documentId, title: resolvedTitle };
  }

  const visible = new Set(visibleChunkIds);
  // Ordered by what the run recorded, not by what the read returned, so the
  // numbering is stable between two readers who can see different amounts.
  const chunkIds = sourceChunkIds.filter((id) => visible.has(id));

  if (chunkIds.length === 0) {
    return {
      kind: 'sources-hidden',
      documentId,
      title: resolvedTitle,
      citedCount: sourceChunkIds.length,
    };
  }

  return { kind: 'cited', documentId, title: resolvedTitle, chunkIds };
}
