import { assert, assertEquals } from '@std/assert';

import { chunkText, estimateTokens } from './chunking.ts';

/** Roughly `tokens` tokens of prose, as whole words. */
function words(count: number, word = 'alpha'): string {
  return Array.from({ length: count }, () => word).join(' ');
}

Deno.test('empty and whitespace-only text produce no chunks', () => {
  assertEquals(chunkText(''), []);
  assertEquals(chunkText('   \n\n  \t '), []);
});

Deno.test('text under the target stays one chunk', () => {
  const chunks = chunkText('A short note about the migration.');
  assertEquals(chunks.length, 1);
  assertEquals(chunks[0].ordinal, 0);
  assertEquals(chunks[0].content, 'A short note about the migration.');
});

Deno.test('ordinals are sequential from zero', () => {
  const chunks = chunkText(words(4000), { targetTokens: 100, overlapTokens: 10 });
  assert(chunks.length > 3);
  assertEquals(chunks.map((chunk) => chunk.ordinal), chunks.map((_, index) => index));
});

Deno.test('no chunk runs far past the target', () => {
  const chunks = chunkText(words(5000), { targetTokens: 200, overlapTokens: 20 });
  for (const chunk of chunks) {
    assert(
      chunk.tokenCount <= 200 * 1.5,
      `chunk ${chunk.ordinal} ran to ${chunk.tokenCount} tokens`,
    );
  }
});

Deno.test('a split prefers a paragraph boundary', () => {
  const text = [words(60, 'first'), words(60, 'second'), words(60, 'third')].join('\n\n');
  const chunks = chunkText(text, { targetTokens: 30, overlapTokens: 0 });

  // Each paragraph is its own chunk, so no chunk holds words from two of them.
  for (const chunk of chunks) {
    const kinds = ['first', 'second', 'third'].filter((word) => chunk.content.includes(word));
    assertEquals(kinds.length, 1, `chunk ${chunk.ordinal} crossed a paragraph boundary`);
  }
});

Deno.test('a paragraph over the target is split on sentence boundaries', () => {
  const sentences = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} says something.`);
  const chunks = chunkText(sentences.join(' '), { targetTokens: 20, overlapTokens: 0 });

  assert(chunks.length > 1);
  for (const chunk of chunks) {
    // A sentence is never cut in half while a boundary was available.
    assert(chunk.content.trim().endsWith('.'), `chunk ${chunk.ordinal} cut a sentence`);
  }
});

Deno.test('a single sentence longer than the target is still split', () => {
  // No boundary to prefer, so the only correct answer is a hard split rather
  // than one chunk the embedding model will refuse.
  const chunks = chunkText(words(2000), { targetTokens: 100, overlapTokens: 0 });
  assert(chunks.length > 5);
  for (const chunk of chunks) assert(chunk.content.length > 0);
});

Deno.test('consecutive chunks overlap by roughly the overlap budget', () => {
  const chunks = chunkText(words(3000, 'w'), { targetTokens: 200, overlapTokens: 50 });
  assert(chunks.length > 2);

  const tail = chunks[0].content.split(' ').slice(-30).join(' ');
  assert(chunks[1].content.startsWith(tail.split(' ')[0]), 'the second chunk did not carry a tail');
  assert(chunks[1].content.includes(tail.split(' ').slice(0, 5).join(' ')));
});

Deno.test('no overlap means no repetition', () => {
  const chunks = chunkText(words(600, 'x'), { targetTokens: 100, overlapTokens: 0 });
  const total = chunks.reduce((sum, chunk) => sum + chunk.content.split(/\s+/).length, 0);
  assertEquals(total, 600);
});

Deno.test('every chunk carries its own token estimate', () => {
  for (const chunk of chunkText(words(1200), { targetTokens: 100, overlapTokens: 10 })) {
    assertEquals(chunk.tokenCount, estimateTokens(chunk.content));
    assert(chunk.tokenCount > 0);
  }
});

Deno.test('chunking is deterministic', () => {
  const text = [words(300, 'a'), words(300, 'b')].join('\n\n');
  assertEquals(
    chunkText(text, { targetTokens: 80, overlapTokens: 10 }),
    chunkText(text, { targetTokens: 80, overlapTokens: 10 }),
  );
});

Deno.test('windows line endings and long runs of blank lines do not change the split', () => {
  const unix = ['One paragraph here.', 'Another paragraph here.'].join('\n\n');
  const windows = ['One paragraph here.', 'Another paragraph here.'].join('\r\n\r\n\r\n\r\n');
  assertEquals(
    chunkText(windows).map((chunk) => chunk.content),
    chunkText(unix).map((chunk) => chunk.content),
  );
});

Deno.test('an overlap at or above the target does not stall', () => {
  // A misconfiguration must produce a finite answer rather than looping.
  const chunks = chunkText(words(500), { targetTokens: 50, overlapTokens: 500 });
  assert(chunks.length > 1);
  assert(chunks.length < 200);
});
