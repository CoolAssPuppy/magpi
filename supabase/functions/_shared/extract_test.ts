import { assert, assertEquals } from '@std/assert';

import { extractText, isExtractable } from './extract.ts';
import { asyncApiErrorFrom } from './testing/assertions.ts';

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

Deno.test('plain text comes through unchanged apart from trimming', async () => {
  const result = await extractText({ bytes: bytes('  Hello, team.  \n'), mimeType: 'text/plain' });
  assertEquals(result.text, 'Hello, team.');
  assertEquals(result.mimeType, 'text/plain');
});

Deno.test('a charset parameter on the mime type does not make it unknown', async () => {
  const result = await extractText({
    bytes: bytes('note'),
    mimeType: 'text/plain; charset=UTF-8',
  });
  assertEquals(result.text, 'note');
  assertEquals(result.mimeType, 'text/plain');
});

Deno.test('markdown keeps its structure, because the chunker splits on it', async () => {
  const source = '# Heading\n\nA paragraph.\n\n- one\n- two';
  const result = await extractText({ bytes: bytes(source), mimeType: 'text/markdown' });
  assertEquals(result.text, source);
});

Deno.test('html loses its tags and keeps its text', async () => {
  const html =
    '<html><head><title>t</title><style>body{color:red}</style></head><body><h1>Launch</h1><p>Ship on <b>Tuesday</b>.</p><script>alert(1)</script></body></html>';
  const result = await extractText({ bytes: bytes(html), mimeType: 'text/html' });

  assert(result.text.includes('Launch'));
  assert(result.text.includes('Ship on Tuesday.'));
  // Script and style contents are not prose and would poison retrieval.
  assert(!result.text.includes('alert'));
  assert(!result.text.includes('color:red'));
});

Deno.test('html block elements become line breaks rather than running together', async () => {
  const result = await extractText({
    bytes: bytes('<p>First</p><p>Second</p><li>Third</li>'),
    mimeType: 'text/html',
  });
  assertEquals(result.text.split('\n').filter((line) => line.length > 0), [
    'First',
    'Second',
    'Third',
  ]);
});

Deno.test('html entities are decoded', async () => {
  const result = await extractText({
    bytes: bytes('<p>Tom &amp; Jerry &lt;3 &#39;quotes&#39; &nbsp;here &#x2713;</p>'),
    mimeType: 'text/html',
  });
  assertEquals(result.text, "Tom & Jerry <3 'quotes' here ✓");
});

Deno.test('json becomes readable lines rather than a wall of punctuation', async () => {
  const result = await extractText({
    bytes: bytes(JSON.stringify({ title: 'SSO rollout', owner: { name: 'Ada' }, tags: ['auth'] })),
    mimeType: 'application/json',
  });
  assertEquals(result.text.split('\n'), [
    'title: SSO rollout',
    'owner.name: Ada',
    'tags.0: auth',
  ]);
});

Deno.test('json that will not parse is a bad request, not a crash', async () => {
  const err = await asyncApiErrorFrom(() =>
    extractText({ bytes: bytes('{ not json'), mimeType: 'application/json' })
  );
  assertEquals(err.status, 422);
});

Deno.test('csv rows carry their column names, so a cell is searchable in context', async () => {
  const csv = 'ticket,owner,status\nENG-1,Ada,open\nENG-2,Grace,closed';
  const result = await extractText({ bytes: bytes(csv), mimeType: 'text/csv' });
  assertEquals(result.text.split('\n'), [
    'ticket: ENG-1; owner: Ada; status: open',
    'ticket: ENG-2; owner: Grace; status: closed',
  ]);
});

Deno.test('a quoted csv cell may hold commas, quotes and newlines', async () => {
  const csv = 'note\n"He said ""ship it"", then left\nthe room"';
  const result = await extractText({ bytes: bytes(csv), mimeType: 'text/csv' });
  assertEquals(result.text, 'note: He said "ship it", then left\nthe room');
});

Deno.test('a csv with only a header row extracts nothing', async () => {
  const result = await extractText({ bytes: bytes('a,b,c'), mimeType: 'text/csv' });
  assertEquals(result.text, '');
});

Deno.test('an unsupported type is refused by name', async () => {
  const err = await asyncApiErrorFrom(() =>
    extractText({ bytes: bytes('MZ'), mimeType: 'application/x-msdownload' })
  );
  assertEquals(err.status, 415);
  assertEquals(err.code, 'unsupported_type');
  assert(err.message.includes('application/x-msdownload'));
});

Deno.test('the supported set is the one the upload surface should offer', () => {
  for (
    const mime of [
      'text/plain',
      'text/markdown',
      'text/html',
      'text/csv',
      'application/json',
      'application/pdf',
    ]
  ) {
    assertEquals(isExtractable(mime), true, `${mime} should be extractable`);
  }
  assertEquals(isExtractable('image/png'), false);
});

Deno.test('a pdf goes through the pdf reader', async () => {
  // Not a real document: proving the route, not the parser, which pdf_test covers.
  const err = await asyncApiErrorFrom(() =>
    extractText({ bytes: bytes('not a pdf at all'), mimeType: 'application/pdf' })
  );
  assertEquals(err.status, 422);
});
