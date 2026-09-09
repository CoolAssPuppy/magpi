import type { Citation } from './protocol';

export type AnswerSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'citation'; readonly label: number; readonly citation: Citation };

const MARKER = /\[(\d+)\]/g;

/**
 * Splits an answer on its [n] markers. A marker with no citation behind it stays
 * as written: the reader lost access to that space, and the answer is still
 * true. This runs on a partial answer while it streams, so it never assumes the
 * text is complete.
 */
export function splitAnswer(
  text: string,
  citations: readonly Citation[],
): readonly AnswerSegment[] {
  if (text === '') return [];

  const segments: AnswerSegment[] = [];
  let consumed = 0;

  MARKER.lastIndex = 0;
  for (let match = MARKER.exec(text); match !== null; match = MARKER.exec(text)) {
    const label = Number(match[1]);
    const cited = citations[label - 1];
    if (!cited) continue;

    appendText(segments, text.slice(consumed, match.index));
    segments.push({ kind: 'citation', label, citation: cited });
    consumed = match.index + match[0].length;
  }

  appendText(segments, text.slice(consumed));
  return segments;
}

function appendText(segments: AnswerSegment[], text: string): void {
  if (text === '') return;

  const previous = segments.at(-1);
  if (previous?.kind === 'text') {
    segments[segments.length - 1] = { kind: 'text', text: previous.text + text };
    return;
  }

  segments.push({ kind: 'text', text });
}
