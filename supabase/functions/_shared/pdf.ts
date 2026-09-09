// Pulling the text out of a PDF without a PDF library.
//
// pdfjs is roughly a megabyte of JavaScript and a cold start we pay on every
// ingest request. What we actually need is narrower than what pdfjs does: find
// the content streams, inflate them, and read the text-showing operators, which
// needs nothing but the web platform Deno already gives us.
//
// The tradeoff is that a PDF built to defeat this (custom encodings, glyph
// subsets with no readable byte values) extracts as empty or as noise. Empty is
// the honest answer for those and the caller decides what to do about it.
//
// This file walks the raw bytes of the file. Reading the tokens inside a
// decoded content stream is pdf_content.ts.

import { readShownText } from './pdf_content.ts';

/**
 * PDF text is almost always WinAnsiEncoding, which is what 'latin1' names in
 * the encoding standard, so byte 0x92 comes back as a right quote instead of a
 * control character.
 */
const winAnsi = new TextDecoder('latin1');

const STREAM = asciiBytes('stream');
const ENDSTREAM = asciiBytes('endstream');

/**
 * A malformed or hostile file must terminate and must not exhaust the worker's
 * memory. A real document is a few hundred streams and a few megabytes of
 * decoded content, so these caps only bite on input we would refuse anyway.
 */
const MAX_STREAMS = 512;
const MAX_DECODED_BYTES = 16 * 1024 * 1024;

/** How far back the dictionary that describes a stream can start. */
const DICT_WINDOW_BYTES = 2048;

const IMAGE_FILTERS = ['/DCTDecode', '/JPXDecode', '/CCITTFaxDecode', '/JBIG2Decode'];

/**
 * Extracted text, one line per text-positioning break.
 *
 * Returns an empty string for a scanned or encrypted document rather than
 * throwing, because "no text here" is a result the caller has to handle either
 * way. Throws only when the bytes are not a PDF.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  assertPdfHeader(bytes);

  const extracted: string[] = [];
  let remainingBytes = MAX_DECODED_BYTES;
  let cursor = 0;

  for (let seen = 0; seen < MAX_STREAMS; seen++) {
    const keyword = indexOfBytes(bytes, STREAM, cursor);
    if (keyword < 0) break;

    if (!isStreamKeywordAt(bytes, keyword)) {
      cursor = keyword + STREAM.length;
      continue;
    }
    const start = skipStreamEol(bytes, keyword + STREAM.length);
    const close = indexOfBytes(bytes, ENDSTREAM, start);
    if (close < 0) break;
    cursor = close + ENDSTREAM.length;

    const dictionary = precedingDictionary(bytes, keyword);
    if (isImage(dictionary)) continue;

    const payload = bytes.subarray(start, trimTrailingEol(bytes, start, close));
    const decoded = isFlate(dictionary) ? await inflate(payload) : payload;
    if (decoded === null || decoded.length > remainingBytes) continue;
    remainingBytes -= decoded.length;

    // Trimmed per stream: a page split across two content streams should read
    // as consecutive lines, not as two blocks with a gap between them.
    const text = readShownText(winAnsi.decode(decoded)).trim();
    if (text.length > 0) extracted.push(text);
  }

  return normalize(extracted.join('\n'));
}

function assertPdfHeader(bytes: Uint8Array): void {
  // Writers prepend junk often enough that byte zero is too strict, but the
  // header is required to be near the front.
  const head = winAnsi.decode(bytes.subarray(0, 1024));
  if (!head.includes('%PDF-')) {
    throw new Error('input is not a PDF: no %PDF header in the first 1024 bytes');
  }
}

function asciiBytes(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, from: number): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/** Rejects the 'stream' sitting inside 'endstream' and inside longer words. */
function isStreamKeywordAt(bytes: Uint8Array, at: number): boolean {
  const before = at > 0 ? bytes[at - 1] : 0x20;
  const after = bytes[at + STREAM.length] ?? 0x20;
  return !isLetter(before) && (after === 0x0d || after === 0x0a || after === 0x20);
}

function isLetter(byte: number): boolean {
  return (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a);
}

function skipStreamEol(bytes: Uint8Array, at: number): number {
  let i = at;
  if (bytes[i] === 0x0d) i++;
  if (bytes[i] === 0x0a) i++;
  return i;
}

function trimTrailingEol(bytes: Uint8Array, start: number, close: number): number {
  let end = close;
  if (end > start && bytes[end - 1] === 0x0a) end--;
  if (end > start && bytes[end - 1] === 0x0d) end--;
  return end;
}

/**
 * The dictionary describing a stream is the one that closes immediately before
 * the keyword, so match backwards from that close rather than guessing at the
 * nearest '<<' in the window.
 */
function precedingDictionary(bytes: Uint8Array, streamAt: number): string {
  const from = Math.max(0, streamAt - DICT_WINDOW_BYTES);
  const window = winAnsi.decode(bytes.subarray(from, streamAt));
  const close = window.lastIndexOf('>>');
  if (close < 0) return '';

  let depth = 0;
  for (let i = close; i >= 0; i--) {
    if (window.startsWith('>>', i)) {
      depth++;
      i--;
    } else if (window.startsWith('<<', i)) {
      depth--;
      if (depth === 0) return window.slice(i, close + 2);
      i--;
    }
  }
  return window;
}

function isImage(dictionary: string): boolean {
  return /\/Subtype\s*\/Image/.test(dictionary) ||
    IMAGE_FILTERS.some((filter) => dictionary.includes(filter));
}

function isFlate(dictionary: string): boolean {
  return /\/Filter\s*(\[\s*)?\/FlateDecode/.test(dictionary);
}

/**
 * Null rather than a throw: one stream we cannot read should cost us that
 * stream, not the rest of the document.
 *
 * PDF writers emit zlib-wrapped deflate, but enough of them omit the two-byte
 * header that the raw fallback is worth the second attempt.
 */
async function inflate(payload: Uint8Array): Promise<Uint8Array | null> {
  for (const format of ['deflate', 'deflate-raw'] as const) {
    try {
      const inflated = singleChunkStream(payload).pipeThrough(new DecompressionStream(format));
      return new Uint8Array(await new Response(inflated).arrayBuffer());
    } catch {
      continue;
    }
  }
  return null;
}

function singleChunkStream(bytes: Uint8Array): ReadableStream<BufferSource> {
  // A view onto a shared buffer is not a BufferSource, and a caller is free to
  // hand us one, so the chunk goes into a buffer we own.
  const chunk = new Uint8Array(bytes.length);
  chunk.set(bytes);
  return new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(chunk);
      controller.close();
    },
  });
}

function normalize(text: string): string {
  const lines = text.split('\n').map((line) => line.replace(/[ \t\r]+$/, ''));
  const collapsed: string[] = [];
  for (const line of lines) {
    if (line === '' && collapsed.at(-1) === '') continue;
    collapsed.push(line);
  }
  return collapsed.join('\n').trim();
}
