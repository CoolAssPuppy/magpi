import { describe, expect, it } from 'vitest';

import { describeDreamOutput, extractChunkCitations, splitCitedText } from './citations';

const CHUNK_A = '3f1d1e2a-0b6c-4a1e-9f3a-1c2d3e4f5a6b';
const CHUNK_B = '8c2b7d90-1111-4222-8333-444455556666';

describe('extracting citations from a dream output', () => {
  it('finds every chunk a dream document cited', () => {
    const citations = extractChunkCitations([
      `The billing migration slipped a week [[chunk:${CHUNK_A}]].`,
      `Support saw three tickets about it [[chunk:${CHUNK_B}]].`,
    ]);

    expect(citations).toEqual([CHUNK_A, CHUNK_B]);
  });

  it('cites a chunk once however many times the text refers to it', () => {
    const citations = extractChunkCitations([
      `First [[chunk:${CHUNK_A}]] and again [[chunk:${CHUNK_A}]].`,
    ]);

    expect(citations).toEqual([CHUNK_A]);
  });

  it('ignores a marker that does not carry a chunk id', () => {
    expect(extractChunkCitations(['[[chunk:not-a-uuid]] and [[document:1]]'])).toEqual([]);
  });

  it('finds nothing in synthesis that cited nothing', () => {
    expect(extractChunkCitations(['Three decisions were made this week.'])).toEqual([]);
  });
});

describe('what a dream run produced', () => {
  it('reports a cited document as an output a reader can check', () => {
    const output = describeDreamOutput({
      documentId: 'doc-1',
      title: 'Engineering digest, 9 September',
      chunkTexts: [`A decision was reversed [[chunk:${CHUNK_A}]].`],
    });

    expect(output).toEqual({
      kind: 'cited',
      documentId: 'doc-1',
      title: 'Engineering digest, 9 September',
      chunkIds: [CHUNK_A],
    });
  });

  it('reports an uncited document as having produced nothing, never as a claim', () => {
    const output = describeDreamOutput({
      documentId: 'doc-1',
      title: 'Engineering digest, 9 September',
      chunkTexts: ['Three decisions were made this week.'],
    });

    expect(output.kind).toBe('uncited');
  });

  it('reports a run with no output document at all', () => {
    const output = describeDreamOutput({ documentId: null, title: null, chunkTexts: [] });

    expect(output).toEqual({ kind: 'none' });
  });

  it('reports an output document whose text has not been chunked yet as uncited', () => {
    const output = describeDreamOutput({ documentId: 'doc-1', title: 'Digest', chunkTexts: [] });

    expect(output.kind).toBe('uncited');
  });
});

describe('rendering cited text', () => {
  it('splits a body into readable text and numbered references', () => {
    const segments = splitCitedText(`Billing slipped [[chunk:${CHUNK_A}]] again.`, [CHUNK_A]);

    expect(segments).toEqual([
      { kind: 'text', value: 'Billing slipped ' },
      { kind: 'citation', chunkId: CHUNK_A, index: 1 },
      { kind: 'text', value: ' again.' },
    ]);
  });

  it('numbers each cited chunk by the order the run recorded', () => {
    const segments = splitCitedText(`[[chunk:${CHUNK_B}]]`, [CHUNK_A, CHUNK_B]);

    expect(segments).toEqual([{ kind: 'citation', chunkId: CHUNK_B, index: 2 }]);
  });

  it('leaves a marker for a chunk the reader cannot see as plain text, dropping the reference', () => {
    const segments = splitCitedText(`Claim [[chunk:${CHUNK_A}]].`, []);

    expect(segments).toEqual([{ kind: 'text', value: 'Claim .' }]);
  });

  it('returns a body with no markers unchanged', () => {
    expect(splitCitedText('Nothing to cite.', [])).toEqual([
      { kind: 'text', value: 'Nothing to cite.' },
    ]);
  });
});
