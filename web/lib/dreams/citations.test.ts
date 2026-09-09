import { describe, expect, it } from 'vitest';

import { describeDreamOutput } from './citations';

const CHUNK_A = '3f1d1e2a-0b6c-4a1e-9f3a-1c2d3e4f5a6b';
const CHUNK_B = '8c2b7d90-1111-4222-8333-444455556666';

const getOutput = (overrides?: Partial<Parameters<typeof describeDreamOutput>[0]>) => ({
  documentId: 'doc-1',
  title: 'Engineering digest, 9 September',
  sourceChunkIds: [CHUNK_A, CHUNK_B],
  visibleChunkIds: [CHUNK_A, CHUNK_B],
  ...overrides,
});

describe('what a dream run produced', () => {
  it('reports a document whose sources a reader can open', () => {
    expect(describeDreamOutput(getOutput())).toEqual({
      kind: 'cited',
      documentId: 'doc-1',
      title: 'Engineering digest, 9 September',
      chunkIds: [CHUNK_A, CHUNK_B],
    });
  });

  it('reports a run that wrote no document at all', () => {
    expect(
      describeDreamOutput(getOutput({ documentId: null, title: null, sourceChunkIds: [] })),
    ).toEqual({ kind: 'none' });
  });

  it('refuses to show a document that cites nothing, however it came to exist', () => {
    const output = describeDreamOutput(getOutput({ sourceChunkIds: [], visibleChunkIds: [] }));

    expect(output).toEqual({
      kind: 'uncited',
      documentId: 'doc-1',
      title: 'Engineering digest, 9 September',
    });
  });

  it('separates a reader who can see no source from a run that had none', () => {
    const output = describeDreamOutput(getOutput({ visibleChunkIds: [] }));

    expect(output).toEqual({
      kind: 'sources-hidden',
      documentId: 'doc-1',
      title: 'Engineering digest, 9 September',
      citedCount: 2,
    });
  });

  it('counts what the run cited, not what this reader can open', () => {
    const output = describeDreamOutput(
      getOutput({ sourceChunkIds: [CHUNK_A, CHUNK_B], visibleChunkIds: [] }),
    );

    expect(output.kind === 'sources-hidden' && output.citedCount).toBe(2);
  });

  it('shows a document whose sources are only partly readable, with the rest dropped', () => {
    const output = describeDreamOutput(getOutput({ visibleChunkIds: [CHUNK_B] }));

    expect(output).toEqual({
      kind: 'cited',
      documentId: 'doc-1',
      title: 'Engineering digest, 9 September',
      chunkIds: [CHUNK_B],
    });
  });

  it('numbers the readable sources in the order the run recorded them', () => {
    const output = describeDreamOutput(
      getOutput({ sourceChunkIds: [CHUNK_A, CHUNK_B], visibleChunkIds: [CHUNK_B, CHUNK_A] }),
    );

    expect(output.kind === 'cited' && output.chunkIds).toEqual([CHUNK_A, CHUNK_B]);
  });

  it('names an untitled document rather than rendering nothing where a title goes', () => {
    const output = describeDreamOutput(getOutput({ title: null }));

    expect(output.kind === 'cited' && output.title).toBe('Untitled');
  });
});
