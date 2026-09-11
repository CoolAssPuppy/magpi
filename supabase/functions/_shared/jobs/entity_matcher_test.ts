import { assertEquals } from '@std/assert';

import { buildMatcher, type Needle } from './entity_matcher.ts';

function found(needles: Needle[], text: string): string[] {
  return [...buildMatcher(needles).find(text)].sort();
}

const PEOPLE: Needle[] = [
  { id: 'jane', text: 'Jane Okafor' },
  { id: 'ben', text: 'Ben Ruiz' },
  { id: 'aurora', text: 'Project Aurora' },
];

Deno.test('a name in the text is found however it was cased', () => {
  assertEquals(found(PEOPLE, 'spoke to JANE okafor on monday'), ['jane']);
});

Deno.test('every name in one chunk comes back from one pass', () => {
  const text = 'Ben Ruiz asked Jane Okafor whether Project Aurora ships.';
  assertEquals(found(PEOPLE, text), ['aurora', 'ben', 'jane']);
});

Deno.test('a name is found across the line break it was wrapped at', () => {
  assertEquals(found(PEOPLE, 'owner: Jane\n  Okafor'), ['jane']);
});

// The reason for the boundary check. Without it every document about bananas mentions Ana.
Deno.test('a name inside a longer word is not a mention', () => {
  assertEquals(found([{ id: 'ana', text: 'Ana' }], 'she ate a banana'), []);
  assertEquals(found([{ id: 'ana', text: 'Ana' }], 'Ana ate it'), ['ana']);
});

Deno.test('punctuation and quotes still bound a name', () => {
  assertEquals(found(PEOPLE, '(Ben Ruiz), "Jane Okafor".'), ['ben', 'jane']);
});

// The case a naive scan gets wrong: one name ends inside another and both are real.
Deno.test('a name that ends inside a longer name is still found', () => {
  const needles = [{ id: 'he', text: 'he' }, { id: 'she', text: 'she' }, {
    id: 'hers',
    text: 'hers',
  }];
  assertEquals(found(needles, 'she said hers'), ['hers', 'she']);
});

Deno.test('a name that is a prefix of another is found on its own', () => {
  const needles = [{ id: 'aurora', text: 'Aurora' }, { id: 'aurora-2', text: 'Aurora 2' }];
  assertEquals(found(needles, 'Aurora shipped'), ['aurora']);
  assertEquals(found(needles, 'Aurora 2 shipped'), ['aurora', 'aurora-2']);
});

Deno.test('a name nobody wrote down is not invented', () => {
  assertEquals(found(PEOPLE, 'nothing here about anyone'), []);
});

// A single letter or an initial matches half the corpus, so it is not worth a mention row.
Deno.test('a name of one character is ignored', () => {
  assertEquals(
    found([{ id: 'j', text: 'J' }, { id: 'jane', text: 'Jane Okafor' }], 'J and Jane Okafor'),
    [
      'jane',
    ],
  );
});

Deno.test('knowing no names finds nothing rather than raising', () => {
  assertEquals(found([], 'Jane Okafor was here'), []);
});
