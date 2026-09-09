// Pulling the text out of a PDF without a PDF library.
//
// pdfjs is roughly a megabyte of JavaScript and a cold start we pay on every
// ingest request. What we actually need is narrower than what pdfjs does: find
// the content streams, inflate them, and read the text-showing operators. That
// fits in one file with nothing but the web platform Deno already gives us.
//
// The tradeoff is that a PDF built to defeat this (custom encodings, glyph
// subsets with no readable byte values) extracts as empty or as noise. Empty is
// the honest answer for those and the caller decides what to do about it.

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

/**
 * A TJ adjustment is in thousandths of a text space unit, subtracted from the
 * position. Below this the gap is a word break; above it the writer is
 * tightening letters and no space was intended.
 */
const WORD_GAP_THRESHOLD = -100;

const IMAGE_FILTERS = ['/DCTDecode', '/JPXDecode', '/CCITTFaxDecode', '/JBIG2Decode'];

type Operand = { kind: 'text'; value: string } | { kind: 'number'; value: number };

interface TextOutput {
  lines: string[];
  current: string;
}

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

function readShownText(content: string): string {
  const out: TextOutput = { lines: [], current: '' };
  let operands: Operand[] = [];
  let i = 0;

  while (i < content.length) {
    const char = content[i];
    if (char === '(') {
      const literal = readLiteral(content, i);
      operands.push({ kind: 'text', value: literal.value });
      i = literal.next;
    } else if (char === '<' && content[i + 1] === '<') {
      i = skipDictionary(content, i);
    } else if (char === '<') {
      const hex = readHexString(content, i);
      operands.push({ kind: 'text', value: hex.value });
      i = hex.next;
    } else if (char === '/') {
      i = skipRegularRun(content, i + 1);
    } else if (char === '%') {
      // A comment can hold an unbalanced '(' that would otherwise open a string
      // and swallow the rest of the stream.
      i = skipComment(content, i);
    } else if (isRegular(char)) {
      const end = skipRegularRun(content, i);
      const token = content.slice(i, end);
      i = end;
      const value = Number(token);
      if (Number.isFinite(value) && /^[+\-.\d]/.test(token)) {
        operands.push({ kind: 'number', value });
      } else if (token === 'BI') {
        i = skipInlineImage(content, i);
        operands = [];
      } else {
        applyOperator(token, operands, out);
        operands = [];
      }
    } else {
      i++;
    }
  }

  out.lines.push(out.current);
  return out.lines.join('\n');
}

function applyOperator(operator: string, operands: readonly Operand[], out: TextOutput): void {
  switch (operator) {
    case 'Tj':
      showLastString(operands, out);
      return;
    case "'":
    case '"':
      breakLine(out);
      showLastString(operands, out);
      return;
    case 'TJ':
      showArray(operands, out);
      return;
    case 'Td':
    case 'TD':
    case 'T*':
    case 'ET':
      breakLine(out);
      return;
  }
}

function showLastString(operands: readonly Operand[], out: TextOutput): void {
  for (let i = operands.length - 1; i >= 0; i--) {
    const operand = operands[i];
    if (operand.kind === 'text') {
      out.current += operand.value;
      return;
    }
  }
}

function showArray(operands: readonly Operand[], out: TextOutput): void {
  for (const operand of operands) {
    if (operand.kind === 'text') out.current += operand.value;
    else if (operand.value < WORD_GAP_THRESHOLD) out.current += ' ';
  }
}

function breakLine(out: TextOutput): void {
  out.lines.push(out.current);
  out.current = '';
}

const ESCAPES: Readonly<Record<string, string>> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  '(': '(',
  ')': ')',
  '\\': '\\',
};

/** Parentheses nest inside a literal string, so the first ')' is not the end. */
function readLiteral(content: string, at: number): { value: string; next: number } {
  let value = '';
  let depth = 1;
  let i = at + 1;

  while (i < content.length && depth > 0) {
    const char = content[i];
    if (char === '\\') {
      const escape = readEscape(content, i);
      value += escape.value;
      i = escape.next;
    } else if (char === '(') {
      depth++;
      value += char;
      i++;
    } else if (char === ')') {
      depth--;
      if (depth > 0) value += char;
      i++;
    } else {
      value += char;
      i++;
    }
  }
  return { value, next: i };
}

function readEscape(content: string, at: number): { value: string; next: number } {
  const char = content[at + 1];
  if (char === undefined) return { value: '', next: at + 1 };
  // A backslash before a newline continues the string across source lines.
  if (char === '\n') return { value: '', next: at + 2 };
  if (char === '\r') return { value: '', next: content[at + 2] === '\n' ? at + 3 : at + 2 };

  if (char >= '0' && char <= '7') {
    let digits = '';
    let i = at + 1;
    while (digits.length < 3 && content[i] >= '0' && content[i] <= '7') {
      digits += content[i];
      i++;
    }
    return { value: String.fromCharCode(parseInt(digits, 8)), next: i };
  }
  return { value: ESCAPES[char] ?? char, next: at + 2 };
}

function readHexString(content: string, at: number): { value: string; next: number } {
  const close = content.indexOf('>', at + 1);
  const end = close < 0 ? content.length : close;
  const digits = content.slice(at + 1, end).replace(/[^0-9a-fA-F]/g, '');
  // An odd digit count means the last byte was written with its zero implied.
  const padded = digits.length % 2 === 1 ? `${digits}0` : digits;

  const bytes = new Uint8Array(padded.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  }
  return { value: winAnsi.decode(bytes), next: end + 1 };
}

function isRegular(char: string): boolean {
  return !'()<>[]{}/%'.includes(char) && !/\s/.test(char);
}

function skipRegularRun(content: string, at: number): number {
  let i = at;
  while (i < content.length && isRegular(content[i])) i++;
  return i;
}

function skipComment(content: string, at: number): number {
  let i = at;
  while (i < content.length && content[i] !== '\n' && content[i] !== '\r') i++;
  return i;
}

function skipDictionary(content: string, at: number): number {
  let depth = 0;
  let i = at;
  while (i < content.length) {
    if (content.startsWith('<<', i)) {
      depth++;
      i += 2;
    } else if (content.startsWith('>>', i)) {
      depth--;
      i += 2;
      if (depth === 0) return i;
    } else {
      i++;
    }
  }
  return i;
}

/**
 * Inline image data is raw bytes in the middle of the content stream and would
 * otherwise be parsed as operators. Delimited EI is a heuristic, but a wrong
 * guess costs one image's worth of noise, not a hang.
 */
function skipInlineImage(content: string, at: number): number {
  const finder = /\sEI(?=[\s\]/<(]|$)/g;
  finder.lastIndex = at;
  const match = finder.exec(content);
  return match === null ? content.length : match.index + match[0].length;
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
