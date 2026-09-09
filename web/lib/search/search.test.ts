import { describe, expect, it } from 'vitest';

import { searchChunks, serializeEmbedding, type SearchDeps } from './search';

type RpcCall = { readonly name: string; readonly args: Record<string, unknown> };

function fakeRpcClient(
  rows: readonly Record<string, unknown>[] = [],
  error: { message: string } | null = null,
): { client: SearchDeps['supabase']; calls: RpcCall[] } {
  const calls: RpcCall[] = [];

  const client = {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return Promise.resolve({ data: rows, error });
    },
  } as unknown as SearchDeps['supabase'];

  return { client, calls };
}

const row = (overrides: Partial<Record<string, unknown>> = {}) => ({
  chunk_id: '11111111-1111-4111-8111-111111111111',
  document_id: '22222222-2222-4222-8222-222222222222',
  space_id: '33333333-3333-4333-8333-333333333333',
  content: 'The SSO ticket is ENG-4417.',
  score: 0.031,
  ...overrides,
});

const embedTo = (vector: readonly number[]) => async () => [vector];

describe('serializeEmbedding', () => {
  it('formats a vector the way pgvector reads it', () => {
    expect(serializeEmbedding([0.5, -0.25, 0])).toBe('[0.5,-0.25,0]');
  });
});

describe('searchChunks', () => {
  it('calls the one search function through the caller client, so RLS applies', async () => {
    const { client, calls } = fakeRpcClient([row()]);

    await searchChunks(
      {
        queryText: 'what is the SSO ticket number',
        spaceFilter: ['33333333-3333-4333-8333-333333333333'],
        matchCount: 8,
        orgId: 'org-1',
      },
      { supabase: client, embed: embedTo([0.1, 0.2]) },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('search');
    expect(calls[0].args).toEqual({
      query_embedding: '[0.1,0.2]',
      query_text: 'what is the SSO ticket number',
      space_filter: ['33333333-3333-4333-8333-333333333333'],
      match_count: 8,
    });
  });

  it('sends no space filter when the conversation is not narrowed', async () => {
    const { client, calls } = fakeRpcClient([]);

    await searchChunks(
      { queryText: 'anything', spaceFilter: null, matchCount: 20, orgId: 'org-1' },
      { supabase: client, embed: embedTo([0]) },
    );

    expect(calls[0].args.space_filter).toBeUndefined();
  });

  it('returns the fused hits as a view model', async () => {
    const { client } = fakeRpcClient([row()]);

    const hits = await searchChunks(
      { queryText: 'ticket', spaceFilter: null, matchCount: 20, orgId: 'org-1' },
      { supabase: client, embed: embedTo([0]) },
    );

    expect(hits).toEqual([
      {
        chunkId: '11111111-1111-4111-8111-111111111111',
        documentId: '22222222-2222-4222-8222-222222222222',
        spaceId: '33333333-3333-4333-8333-333333333333',
        content: 'The SSO ticket is ENG-4417.',
        score: 0.031,
      },
    ]);
  });

  it('returns nothing for a blank question without embedding it', async () => {
    const { client, calls } = fakeRpcClient([row()]);
    let embedded = 0;

    const hits = await searchChunks(
      { queryText: '   ', spaceFilter: null, matchCount: 20, orgId: 'org-1' },
      {
        supabase: client,
        embed: async () => {
          embedded += 1;
          return [[0]];
        },
      },
    );

    expect(hits).toEqual([]);
    expect(embedded).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('throws when the search function fails, so the caller does not answer from nothing', async () => {
    const { client } = fakeRpcClient([], { message: 'permission denied for table chunks' });

    await expect(
      searchChunks(
        { queryText: 'ticket', spaceFilter: null, matchCount: 20, orgId: 'org-1' },
        { supabase: client, embed: embedTo([0]) },
      ),
    ).rejects.toThrow('permission denied for table chunks');
  });
});
