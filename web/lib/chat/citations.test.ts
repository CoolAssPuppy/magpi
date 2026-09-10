import { describe, expect, it } from 'vitest';

import type { Json } from '@/lib/database.types';

import { excerptOf, parseCitationIds, resolveCitations, resolveCitationSets } from './citations';
import { chunkRow, readerSeeing, type ChunkRow } from './test-support';

const CHUNK_A = '11111111-1111-4111-8111-111111111111';
const CHUNK_B = '22222222-2222-4222-8222-222222222222';
const DOC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('parseCitationIds', () => {
  it('reads the chunk ids stored on a message', () => {
    const stored: Json = [CHUNK_A, CHUNK_B];

    expect(parseCitationIds(stored)).toEqual([CHUNK_A, CHUNK_B]);
  });

  it('reads an empty citation list', () => {
    expect(parseCitationIds([])).toEqual([]);
  });

  it('refuses a shape our own writer could not have produced', () => {
    expect(() => parseCitationIds({ chunk: CHUNK_A } as Json)).toThrow();
  });
});

describe('excerptOf', () => {
  it('leaves short content alone', () => {
    expect(excerptOf('Short enough.')).toBe('Short enough.');
  });

  it('cuts long content at a word boundary', () => {
    const excerpt = excerptOf(`${'word '.repeat(80)}end`);

    expect(excerpt.length).toBeLessThanOrEqual(243);
    expect(excerpt.endsWith('...')).toBe(true);
    expect(excerpt).not.toMatch(/wor\.\.\.$/);
  });
});

describe('resolveCitations', () => {
  it('resolves the chunk text and the document title through the caller client', async () => {
    const { supabase, asked } = readerSeeing([chunkRow()]);

    const citations = await resolveCitations(supabase, [CHUNK_A]);

    expect(asked).toEqual([[CHUNK_A]]);
    expect(citations).toEqual([
      {
        chunkId: CHUNK_A,
        documentId: DOC_A,
        documentTitle: 'Q3 platform notes',
        documentSource: null,
        excerpt: 'The SSO rollout is blocked on ENG-4417.',
        label: 1,
      },
    ]);
  });

  it('keeps the order the answer cited them in', async () => {
    const second: ChunkRow = chunkRow({
      id: CHUNK_B,
      document_id: DOC_B,
      documents: { title: 'Second' },
    });
    const { supabase } = readerSeeing([second, chunkRow()]);

    const citations = await resolveCitations(supabase, [CHUNK_B, CHUNK_A]);

    expect(citations.map((citation) => citation.chunkId)).toEqual([CHUNK_B, CHUNK_A]);
  });

  it('drops a citation the reader lost access to, without failing', async () => {
    const { supabase } = readerSeeing([chunkRow()]);

    const citations = await resolveCitations(supabase, [CHUNK_A, CHUNK_B]);

    expect(citations.map((citation) => citation.chunkId)).toEqual([CHUNK_A]);
  });

  it('keeps the numbering the answer was written against when one is dropped', async () => {
    const second: ChunkRow = chunkRow({
      id: CHUNK_B,
      document_id: DOC_B,
      documents: { title: 'Second' },
    });
    const { supabase } = readerSeeing([second]);

    const citations = await resolveCitations(supabase, [CHUNK_A, CHUNK_B]);

    expect(citations).toHaveLength(1);
    expect(citations[0]).toMatchObject({ chunkId: CHUNK_B, label: 2 });
  });

  it('reads nothing when a message has no citations', async () => {
    const { supabase, asked } = readerSeeing([chunkRow()]);

    expect(await resolveCitations(supabase, [])).toEqual([]);
    expect(asked).toEqual([]);
  });

  it('names a document whose title row is out of reach', async () => {
    const { supabase } = readerSeeing([chunkRow({ documents: null })]);

    const [citation] = await resolveCitations(supabase, [CHUNK_A]);

    expect(citation.documentTitle).toBe('Untitled');
  });
});

describe('resolveCitationSets', () => {
  it('reads a whole conversation of citations in one query', async () => {
    const second: ChunkRow = chunkRow({
      id: CHUNK_B,
      document_id: DOC_B,
      documents: { title: 'Second' },
    });
    const { supabase, asked } = readerSeeing([chunkRow(), second]);

    const sets = await resolveCitationSets(supabase, [[CHUNK_A], [CHUNK_A, CHUNK_B]]);

    expect(asked).toHaveLength(1);
    expect(sets[0].map((citation) => citation.label)).toEqual([1]);
    expect(sets[1].map((citation) => citation.label)).toEqual([1, 2]);
  });
});
