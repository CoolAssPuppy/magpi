/** A dream output and its citations, resolved through RLS at read time, as chat citations are. */
export type DreamOutput =
  | { readonly kind: 'none' }
  /** The run cited nothing. Unreachable: a run that read zero chunks writes no document. */
  | { readonly kind: 'uncited'; readonly documentId: string; readonly title: string }
  /** The cited sources no longer resolve, because the source documents went away. */
  | {
      readonly kind: 'sources-gone';
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
  // Ordered by what the run recorded, so numbering is stable across readers.
  const chunkIds = sourceChunkIds.filter((id) => visible.has(id));

  if (chunkIds.length === 0) {
    return {
      kind: 'sources-gone',
      documentId,
      title: resolvedTitle,
      citedCount: sourceChunkIds.length,
    };
  }

  return { kind: 'cited', documentId, title: resolvedTitle, chunkIds };
}
