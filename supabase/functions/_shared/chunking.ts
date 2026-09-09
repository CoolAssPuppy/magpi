// Turning a document into the units that get embedded.
//
// Pure: same text in, same chunks out, no clock, no network, no database. That
// is what lets the ingest job be tested without a server, and what lets a
// retrieval-quality question be settled by reading this file.

/** What the embedding model is asked for at a time. */
export const DEFAULT_TARGET_TOKENS = 800;

/**
 * How much of the previous chunk each one repeats.
 *
 * A sentence that answers a question sitting on a chunk boundary is retrievable
 * from neither side without this.
 */
export const DEFAULT_OVERLAP_TOKENS = 100;

export interface Chunk {
  ordinal: number;
  content: string;
  tokenCount: number;
}

export interface ChunkOptions {
  targetTokens?: number;
  overlapTokens?: number;
}

/**
 * Four characters to a token, which is close enough for English prose and for
 * deciding where to cut.
 *
 * Not a real tokenizer: carrying one into the edge runtime costs a megabyte and
 * a cold start to make a boundary decision that is already approximate. The
 * exact count that matters is the one the model reports, and that is what gets
 * written to model_calls.
 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Paragraphs, then sentences, then words: the boundaries in order of preference. */
function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** The last resort, for a sentence with no boundary inside the budget. */
function splitWords(sentence: string, targetTokens: number): string[] {
  const words = sentence.split(/\s+/).filter((word) => word.length > 0);
  const out: string[] = [];
  let current: string[] = [];
  let tokens = 0;

  for (const word of words) {
    const cost = estimateTokens(word) + 1;
    if (tokens + cost > targetTokens && current.length > 0) {
      out.push(current.join(' '));
      current = [];
      tokens = 0;
    }
    current.push(word);
    tokens += cost;
  }
  if (current.length > 0) out.push(current.join(' '));
  return out;
}

/**
 * The smallest pieces that will be packed into chunks.
 *
 * A piece is at most one chunk's worth on its own, so packing never has to cut
 * one, and the boundary a reader sees is always the best one available.
 */
function splitUnits(text: string, targetTokens: number): string[] {
  const units: string[] = [];

  for (const paragraph of splitParagraphs(text)) {
    if (estimateTokens(paragraph) <= targetTokens) {
      units.push(paragraph);
      continue;
    }
    for (const sentence of splitSentences(paragraph)) {
      if (estimateTokens(sentence) <= targetTokens) {
        units.push(sentence);
        continue;
      }
      units.push(...splitWords(sentence, targetTokens));
    }
  }

  return units;
}

/** Units from the end of a chunk worth about `budget` tokens, oldest first. */
function tailWithin(units: string[], budget: number): string[] {
  if (budget <= 0) return [];
  const tail: string[] = [];
  let tokens = 0;

  for (let i = units.length - 1; i >= 0; i--) {
    const cost = estimateTokens(units[i]);
    // The whole previous chunk repeated is not an overlap, it is a duplicate,
    // and it is also how a too-large overlap turns packing into a loop.
    if (tokens + cost > budget || tail.length >= units.length - 1) break;
    tail.unshift(units[i]);
    tokens += cost;
  }
  return tail;
}

/**
 * Packs a document into overlapping chunks at paragraph, then sentence, then
 * word boundaries.
 *
 * Paragraphs are never merged across a blank line, so a chunk holds one idea
 * where the document offered one.
 */
export function chunkText(text: string, options: ChunkOptions = {}): Chunk[] {
  const targetTokens = options.targetTokens ?? DEFAULT_TARGET_TOKENS;
  const overlapTokens = Math.min(options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS, targetTokens - 1);

  const units = splitUnits(text, targetTokens);
  if (units.length === 0) return [];

  const chunks: Chunk[] = [];
  let current: string[] = [];
  let tokens = 0;

  const flush = (): void => {
    if (current.length === 0) return;
    const content = current.join('\n\n');
    chunks.push({ ordinal: chunks.length, content, tokenCount: estimateTokens(content) });
    current = tailWithin(current, overlapTokens);
    tokens = current.reduce((sum, unit) => sum + estimateTokens(unit), 0);
  };

  for (const unit of units) {
    const cost = estimateTokens(unit);
    if (tokens + cost > targetTokens && current.length > 0) flush();
    current.push(unit);
    tokens += cost;
  }

  // The last flush must not leave a tail behind, or the loop would never end.
  if (current.length > 0) {
    const content = current.join('\n\n');
    chunks.push({ ordinal: chunks.length, content, tokenCount: estimateTokens(content) });
  }

  return chunks;
}
