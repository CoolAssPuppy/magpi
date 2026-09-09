/**
 * A dream output is a claim the product makes without being asked, so every one
 * of them cites the chunks it came from. The worker writes those citations into
 * the document body as `[[chunk:<uuid>]]`, and they are resolved through RLS when
 * the run is read, never when it is written. A reader who has lost access to a
 * source sees the text with the reference dropped.
 */
const CITATION_MARKER = /\[\[chunk:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]\]/gi;

export function extractChunkCitations(chunkTexts: readonly string[]): readonly string[] {
  const found = new Set<string>();

  for (const text of chunkTexts) {
    for (const match of text.matchAll(CITATION_MARKER)) {
      found.add(match[1]);
    }
  }

  return [...found];
}

export type DreamOutput =
  | { readonly kind: 'none' }
  | { readonly kind: 'uncited'; readonly documentId: string; readonly title: string }
  | {
      readonly kind: 'cited';
      readonly documentId: string;
      readonly title: string;
      readonly chunkIds: readonly string[];
    };

/**
 * An output document with no citations is not shown as a claim. There is no
 * uncited synthesis, so the run reads as having produced nothing.
 */
export function describeDreamOutput({
  documentId,
  title,
  chunkTexts,
}: {
  readonly documentId: string | null;
  readonly title: string | null;
  readonly chunkTexts: readonly string[];
}): DreamOutput {
  if (!documentId) return { kind: 'none' };

  const chunkIds = extractChunkCitations(chunkTexts);
  const resolvedTitle = title ?? 'Untitled';

  if (chunkIds.length === 0) return { kind: 'uncited', documentId, title: resolvedTitle };
  return { kind: 'cited', documentId, title: resolvedTitle, chunkIds };
}

export type CitedSegment =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'citation'; readonly chunkId: string; readonly index: number };

/**
 * Splits a dream document body into readable text and numbered references.
 * `visibleChunkIds` is what came back through RLS, so a citation to a chunk the
 * reader cannot see disappears rather than rendering as a dead marker.
 */
export function splitCitedText(
  body: string,
  visibleChunkIds: readonly string[],
): readonly CitedSegment[] {
  const numbering = new Map(visibleChunkIds.map((id, index) => [id.toLowerCase(), index + 1]));
  const segments: CitedSegment[] = [];
  let pendingText = '';
  let cursor = 0;

  const flushText = () => {
    if (pendingText !== '') segments.push({ kind: 'text', value: pendingText });
    pendingText = '';
  };

  for (const match of body.matchAll(CITATION_MARKER)) {
    const start = match.index;
    pendingText += body.slice(cursor, start);
    cursor = start + match[0].length;

    const index = numbering.get(match[1].toLowerCase());
    // A citation to a chunk the reader lost access to leaves the text whole and
    // drops the reference, rather than rendering a marker that goes nowhere.
    if (index === undefined) continue;

    flushText();
    segments.push({ kind: 'citation', chunkId: match[1], index });
  }

  pendingText += body.slice(cursor);
  flushText();

  return segments;
}
