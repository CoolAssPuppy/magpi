// Bytes to text, for everything the upload surface accepts.
//
// The output feeds the chunker, so the goal is prose a person would recognise,
// not a faithful rendering. Structure that the chunker splits on (blank lines,
// headings) is worth keeping; everything else is noise in an embedding.

import { ApiError } from './errors.ts';
import { extractPdfText } from './pdf.ts';

export interface ExtractInput {
  bytes: Uint8Array;
  mimeType: string;
}

export interface Extracted {
  text: string;
  /** The type without its parameters, which is what gets stored on the document. */
  mimeType: string;
}

type Extractor = (bytes: Uint8Array) => Promise<string>;

function decode(bytes: Uint8Array): string {
  // Lossy rather than fatal: one bad byte in a large document should not lose
  // the document.
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function unprocessable(what: string): ApiError {
  return new ApiError(422, 'unreadable_document', `that file could not be read as ${what}`);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Elements whose closing tag ends a line of prose. */
const BLOCK_TAGS =
  /<\/?(p|div|br|li|tr|h[1-6]|section|article|header|footer|blockquote|pre|table|ul|ol)\b[^>]*>/gi;

function htmlToText(bytes: Uint8Array): Promise<string> {
  const withoutHidden = decode(bytes)
    // Script and style bodies are code, not prose, and would poison retrieval.
    .replace(/<(script|style|head|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const lines = decodeEntities(
    withoutHidden.replace(BLOCK_TAGS, '\n').replace(/<[^>]*>/g, ''),
  )
    .split('\n')
    // \u00a0 is what &nbsp; decodes to, and it is invisible in the source.
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter((line) => line.length > 0);

  return Promise.resolve(lines.join('\n'));
}

/**
 * One `path: value` line per leaf.
 *
 * A pretty-printed object embeds mostly braces. Naming the path next to the
 * value is what makes a field searchable by the name a person would use.
 */
function flattenJson(value: unknown, path: string, lines: string[]): void {
  if (value === null || value === undefined) return;

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      flattenJson(item, path ? `${path}.${index}` : `${index}`, lines)
    );
    return;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      flattenJson(child, path ? `${path}.${key}` : key, lines);
    }
    return;
  }
  lines.push(path ? `${path}: ${String(value)}` : String(value));
}

function jsonToText(bytes: Uint8Array): Promise<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decode(bytes));
  } catch {
    throw unprocessable('json');
  }
  const lines: string[] = [];
  flattenJson(parsed, '', lines);
  return Promise.resolve(lines.join('\n'));
}

/** RFC 4180 fields: quoted cells may hold commas, doubled quotes and newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char !== '"') {
        cell += char;
      } else if (text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      // A CRLF is one break, not two empty rows.
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((value) => value.trim().length > 0));
}

function csvToText(bytes: Uint8Array): Promise<string> {
  const rows = parseCsv(decode(bytes));
  if (rows.length < 2) return Promise.resolve('');

  const headers = rows[0].map((header) => header.trim());
  const lines = rows.slice(1).map((cells) =>
    cells
      .map((cell, index) => ({
        header: headers[index] ?? `column ${index + 1}`,
        value: cell.trim(),
      }))
      .filter((field) => field.value.length > 0)
      .map((field) => `${field.header}: ${field.value}`)
      .join('; ')
  );

  return Promise.resolve(lines.filter((line) => line.length > 0).join('\n'));
}

async function pdfToText(bytes: Uint8Array): Promise<string> {
  try {
    return await extractPdfText(bytes);
  } catch {
    // The reader distinguishes malformed from empty; the caller only needs to
    // know the document could not be read, and a stack trace helps nobody here.
    throw unprocessable('a pdf');
  }
}

const plain: Extractor = (bytes) => Promise.resolve(decode(bytes));

const EXTRACTORS: Record<string, Extractor> = {
  'text/plain': plain,
  'text/markdown': plain,
  'text/x-markdown': plain,
  'text/html': htmlToText,
  'application/xhtml+xml': htmlToText,
  'text/csv': csvToText,
  'application/csv': csvToText,
  'application/json': jsonToText,
  'text/json': jsonToText,
  'application/pdf': pdfToText,
};

/** The type without its parameters, lowercased. */
function baseType(mimeType: string): string {
  return mimeType.split(';', 1)[0].trim().toLowerCase();
}

export function isExtractable(mimeType: string): boolean {
  return Object.hasOwn(EXTRACTORS, baseType(mimeType));
}

export async function extractText(input: ExtractInput): Promise<Extracted> {
  const mimeType = baseType(input.mimeType);
  if (!Object.hasOwn(EXTRACTORS, mimeType)) {
    throw new ApiError(415, 'unsupported_type', `${mimeType} cannot be indexed yet`);
  }
  return { text: (await EXTRACTORS[mimeType](input.bytes)).trim(), mimeType };
}
