import { assert, assertEquals, assertRejects, assertStringIncludes } from '@std/assert';

import { extractPdfText } from './pdf.ts';

interface PdfStream {
  body: Uint8Array;
  /** Dictionary entries added alongside /Length, such as a filter or subtype. */
  entries?: string;
}

/** Byte per character, so an escaped high byte in a fixture stays one byte. */
function latin1Bytes(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
}

function textStream(content: string, entries?: string): PdfStream {
  return { body: latin1Bytes(content), entries };
}

function singleChunkStream(bytes: Uint8Array): ReadableStream<BufferSource> {
  // A view onto a shared buffer is not a BufferSource, so the chunk goes into a buffer we own.
  const chunk = new Uint8Array(bytes.length);
  chunk.set(bytes);
  return new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(chunk);
      controller.close();
    },
  });
}

async function deflate(bytes: Uint8Array, format: 'deflate' | 'deflate-raw'): Promise<Uint8Array> {
  const compressed = singleChunkStream(bytes).pipeThrough(new CompressionStream(format));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

async function flateStream(content: string): Promise<PdfStream> {
  return {
    body: await deflate(latin1Bytes(content), 'deflate'),
    entries: '/Filter /FlateDecode',
  };
}

/** A one-page document whose /Contents lists every given stream, with a real xref table. */
function buildPdf(streams: readonly PdfStream[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  const push = (text: string | Uint8Array): void => {
    const part = typeof text === 'string' ? latin1Bytes(text) : text;
    parts.push(part);
    length += part.length;
  };
  const beginObject = (): void => {
    offsets.push(length);
  };

  const contents = streams.map((_, index) => `${index + 4} 0 R`).join(' ');
  push('%PDF-1.7\n');
  beginObject();
  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  beginObject();
  push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  beginObject();
  push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Contents [${contents}] >>\nendobj\n`,
  );

  streams.forEach((stream, index) => {
    beginObject();
    const entries = stream.entries === undefined ? '' : ` ${stream.entries}`;
    push(`${index + 4} 0 obj\n<< /Length ${stream.body.length}${entries} >>\nstream\n`);
    push(stream.body);
    push('\nendstream\nendobj\n');
  });

  const size = offsets.length + 1;
  const xrefAt = length;
  push(`xref\n0 ${size}\n0000000000 65535 f \n`);
  for (const offset of offsets) {
    push(`${offset.toString().padStart(10, '0')} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const file = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    file.set(part, at);
    at += part.length;
  }
  return file;
}

const HELLO = 'BT /F1 12 Tf 72 720 Td (Hello, world.) Tj ET';

Deno.test('reads a literal string shown with Tj from an uncompressed stream', async () => {
  assertEquals(await extractPdfText(buildPdf([textStream(HELLO)])), 'Hello, world.');
});

Deno.test('reads the same content through a FlateDecode stream', async () => {
  assertEquals(await extractPdfText(buildPdf([await flateStream(HELLO)])), 'Hello, world.');
});

Deno.test('reads a flate stream written without the zlib header', async () => {
  const stream: PdfStream = {
    body: await deflate(latin1Bytes(HELLO), 'deflate-raw'),
    entries: '/Filter /FlateDecode',
  };
  assertEquals(await extractPdfText(buildPdf([stream])), 'Hello, world.');
});

Deno.test('accepts the array form of the filter entry', async () => {
  const stream = await flateStream(HELLO);
  assertEquals(
    await extractPdfText(buildPdf([{ ...stream, entries: '/Filter [/FlateDecode]' }])),
    'Hello, world.',
  );
});

Deno.test('a wide negative kerning adjustment becomes a space', async () => {
  const pdf = buildPdf([textStream('BT [(Hello) -250 (World)] TJ ET')]);
  assertEquals(await extractPdfText(pdf), 'Hello World');
});

Deno.test('a narrow kerning adjustment inserts nothing', async () => {
  const pdf = buildPdf([textStream('BT [(Hel) -50 (lo) 12 (!)] TJ ET')]);
  assertEquals(await extractPdfText(pdf), 'Hello!');
});

Deno.test('decodes hex strings shown with Tj and inside a TJ array', async () => {
  assertEquals(
    await extractPdfText(buildPdf([textStream('BT <48656C6C6F> Tj ET')])),
    'Hello',
  );
  assertEquals(
    await extractPdfText(buildPdf([textStream('BT [<48656C6C6F> -300 <576F726C64>] TJ ET')])),
    'Hello World',
  );
});

Deno.test('decodes escaped parentheses and octal escapes', async () => {
  const pdf = buildPdf([textStream('BT (A \\(B\\) C \\251 D\\\\E) Tj ET')]);
  assertEquals(await extractPdfText(pdf), 'A (B) C © D\\E');
});

Deno.test('a backslash before a newline continues the string', async () => {
  const pdf = buildPdf([textStream('BT (line one \\\nstill one) Tj ET')]);
  assertEquals(await extractPdfText(pdf), 'line one still one');
});

Deno.test('balanced parentheses inside a literal string are kept', async () => {
  const pdf = buildPdf([textStream('BT (outer (inner) done) Tj (after) Tj ET')]);
  assertEquals(await extractPdfText(pdf), 'outer (inner) doneafter');
});

Deno.test('Td and T* break lines, and the quote operator shows on a new one', async () => {
  const pdf = buildPdf([
    textStream("BT (One) Tj 0 -14 Td (Two) Tj T* (Three) Tj (Four) ' ET"),
  ]);
  assertEquals(await extractPdfText(pdf), 'One\nTwo\nThree\nFour');
});

Deno.test('two content streams produce both texts in order', async () => {
  const pdf = buildPdf([
    textStream('BT (First stream.) Tj ET'),
    await flateStream('BT (Second stream.) Tj ET'),
  ]);
  assertEquals(await extractPdfText(pdf), 'First stream.\nSecond stream.');
});

Deno.test('an image stream is skipped', async () => {
  const pdf = buildPdf([
    textStream('BT (Caption.) Tj ET', '/Subtype /Image /Width 1 /Height 1'),
    textStream('BT (Body text.) Tj ET'),
  ]);
  assertEquals(await extractPdfText(pdf), 'Body text.');
});

Deno.test('a stream with an image filter is skipped', async () => {
  const pdf = buildPdf([
    textStream('BT (Photo.) Tj ET', '/Filter /DCTDecode'),
    textStream('BT (Body text.) Tj ET'),
  ]);
  assertEquals(await extractPdfText(pdf), 'Body text.');
});

Deno.test('a stream that will not inflate is skipped without failing the document', async () => {
  const corrupt: PdfStream = {
    body: Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]),
    entries: '/Filter /FlateDecode',
  };
  const pdf = buildPdf([corrupt, textStream('BT (Body text.) Tj ET')]);
  assertEquals(await extractPdfText(pdf), 'Body text.');
});

Deno.test('inline image data is not read as operators', async () => {
  const pdf = buildPdf([
    textStream('BT (Before.) Tj ET\nBI /W 1 /H 1 ID (junk) Tj EI\nBT (After.) Tj ET'),
  ]);
  const text = await extractPdfText(pdf);
  assertStringIncludes(text, 'Before.');
  assertStringIncludes(text, 'After.');
  assert(!text.includes('junk'));
});

Deno.test('a document with no text returns an empty string', async () => {
  const imageOnly = buildPdf([textStream('BT (Caption.) Tj ET', '/Subtype /Image')]);
  assertEquals(await extractPdfText(imageOnly), '');
  assertEquals(await extractPdfText(buildPdf([])), '');
});

Deno.test('blank lines collapse and trailing whitespace goes', async () => {
  const pdf = buildPdf([
    textStream('BT (Top.   ) Tj T* T* T* T* (Bottom.) Tj ET'),
  ]);
  assertEquals(await extractPdfText(pdf), 'Top.\n\nBottom.');
});

Deno.test('bytes that are not a PDF throw', async () => {
  await assertRejects(
    () => extractPdfText(latin1Bytes('this is a plain text file, not a PDF at all')),
    Error,
    'not a PDF',
  );
});

Deno.test('a comment inside a content stream is not parsed as operators', async () => {
  const pdf = buildPdf([
    textStream('BT (Before.) Tj ET\n% a note with an unbalanced ( in it\nBT (After.) Tj ET'),
  ]);
  assertEquals(await extractPdfText(pdf), 'Before.\nAfter.');
});
