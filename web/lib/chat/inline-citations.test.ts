import { describe, expect, it } from 'vitest';

import type { Citation } from './protocol';
import { splitAnswer } from './inline-citations';

const citation = (overrides: Partial<Citation> = {}): Citation => ({
  chunkId: '11111111-1111-4111-8111-111111111111',
  documentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  documentTitle: 'Q3 platform notes',
  documentSource: null,
  excerpt: 'The SSO rollout is blocked on ENG-4417.',
  label: 1,
  ...overrides,
});

describe('splitAnswer', () => {
  it('turns a marker into a reference to the passage it cites', () => {
    const segments = splitAnswer('SSO is blocked on ENG-4417 [1].', [citation()]);

    expect(segments).toEqual([
      { kind: 'text', text: 'SSO is blocked on ENG-4417 ' },
      { kind: 'citation', label: 1, citation: citation() },
      { kind: 'text', text: '.' },
    ]);
  });

  it('reads several markers in one answer', () => {
    const second = citation({
      chunkId: '22222222-2222-4222-8222-222222222222',
      documentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      label: 2,
    });

    const labels = splitAnswer('One [1] and two [2].', [citation(), second])
      .filter((segment) => segment.kind === 'citation')
      .map((segment) => segment.label);

    expect(labels).toEqual([1, 2]);
  });

  it('leaves a marker whose source the reader cannot see as plain text', () => {
    const segments = splitAnswer('Answer stands [2].', [citation()]);

    expect(segments).toEqual([{ kind: 'text', text: 'Answer stands [2].' }]);
  });

  it('returns nothing for an answer that has not started', () => {
    expect(splitAnswer('', [citation()])).toEqual([]);
  });
});
