import { act, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useInfiniteQuery,
  type SupabaseQueryHandler,
  type SupabaseTableData,
} from './use-infinite-query';

type ConversationRow = SupabaseTableData<'conversations'>;

type Page = {
  readonly from: number;
  readonly to: number;
  readonly table: string;
  readonly columns: string;
  readonly shaping: readonly string[];
};

const server = {
  pages: [] as Page[],
  rows: [] as ConversationRow[],
  count: 0,
  failure: null as Error | null,
};

const getRow = (id: string, overrides: Partial<ConversationRow> = {}): ConversationRow => ({
  id,
  title: id,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  org_id: 'org-1',
  user_id: 'user-1',
  space_filter: null,
  ...overrides,
});

/** Enough of a PostgREST builder to record what the hook asked for, chained as the real one is. */
function getBuilder(table: string, columns: string) {
  const shaping: string[] = [];
  const builder = {
    order: (column: string) => {
      shaping.push(`order:${column}`);
      return builder;
    },
    eq: (column: string, value: string) => {
      shaping.push(`eq:${column}=${value}`);
      return builder;
    },
    range: async (from: number, to: number) => {
      server.pages.push({ from, to, table, columns, shaping: [...shaping] });
      if (server.failure) return { data: null, count: null, error: server.failure };
      return { data: server.rows.slice(from, to + 1), count: server.count, error: null };
    },
  };
  return builder;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: (columns: string) => getBuilder(table, columns),
    }),
  }),
}));

type QueryResult = ReturnType<typeof useInfiniteQuery<ConversationRow, 'conversations'>>;

/** The hook's return value is the whole of what a caller sees. */
let current: QueryResult;

function Probe({
  trailingQuery,
  trailingQueryKey,
  pageSize,
  columns,
}: {
  trailingQuery?: SupabaseQueryHandler<'conversations'>;
  trailingQueryKey?: unknown;
  pageSize?: number;
  columns?: string;
}) {
  const query = useInfiniteQuery<ConversationRow, 'conversations'>({
    tableName: 'conversations',
    columns,
    pageSize,
    trailingQuery,
    trailingQueryKey,
  });
  // After the commit, so reading it never races a render React has not finished.
  useEffect(() => {
    current = query;
  });
  return null;
}

const byName: SupabaseQueryHandler<'conversations'> = (query) => query.order('updated_at');
const byRecency: SupabaseQueryHandler<'conversations'> = (query) => query.order('created_at');

beforeEach(() => {
  server.pages = [];
  server.rows = Array.from({ length: 5 }, (_, index) => getRow(`row-${index}`));
  server.count = 5;
  server.failure = null;
});

describe('reading a table a page at a time', () => {
  it('has the first page as soon as the screen is up', async () => {
    render(<Probe pageSize={2} />);

    await waitFor(() => expect(current.isSuccess).toBe(true));
    expect(current.data.map((row) => row.id)).toEqual(['row-0', 'row-1']);
    expect(current.count).toBe(5);
    expect(current.hasMore).toBe(true);
    expect(current.isLoading).toBe(false);
  });

  it('asks for every column and twenty rows unless told otherwise', async () => {
    render(<Probe />);

    await waitFor(() => expect(server.pages).toHaveLength(1));
    expect(server.pages[0]).toMatchObject({
      table: 'conversations',
      columns: '*',
      from: 0,
      to: 19,
    });
  });

  it('asks for only the columns the caller named', async () => {
    render(<Probe columns="id,title" pageSize={2} />);

    await waitFor(() => expect(server.pages).toHaveLength(1));
    expect(server.pages[0].columns).toBe('id,title');
  });

  it('adds the next page to what is already on screen', async () => {
    render(<Probe pageSize={2} />);
    await waitFor(() => expect(current.isSuccess).toBe(true));

    await act(() => current.fetchNextPage());

    expect(current.data.map((row) => row.id)).toEqual(['row-0', 'row-1', 'row-2', 'row-3']);
    expect(server.pages.map((page) => [page.from, page.to])).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('stops asking once it holds everything the table has', async () => {
    render(<Probe pageSize={2} />);
    await waitFor(() => expect(current.isSuccess).toBe(true));

    await act(() => current.fetchNextPage());
    await act(() => current.fetchNextPage());
    await act(() => current.fetchNextPage());

    expect(current.hasMore).toBe(false);
    expect(current.data).toHaveLength(5);
    expect(server.pages).toHaveLength(3);
  });

  // Two overlapping requests would append the same rows twice.
  it('ignores a second request for the next page while one is in flight', async () => {
    render(<Probe pageSize={2} />);
    await waitFor(() => expect(current.isSuccess).toBe(true));

    await act(async () => {
      await Promise.all([current.fetchNextPage(), current.fetchNextPage()]);
    });

    expect(server.pages.map((page) => [page.from, page.to])).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(current.data.map((row) => row.id)).toEqual(['row-0', 'row-1', 'row-2', 'row-3']);
  });

  it('reads as empty rather than as loading when the table has nothing in it', async () => {
    server.rows = [];
    server.count = 0;
    render(<Probe pageSize={2} />);

    await waitFor(() => expect(current.isSuccess).toBe(true));
    expect(current.data).toEqual([]);
    expect(current.hasMore).toBe(false);
  });
});

describe('shaping the query', () => {
  it('applies the shaping the caller gave to the page it fetches', async () => {
    render(<Probe pageSize={2} trailingQuery={byName} />);

    await waitFor(() => expect(server.pages).toHaveLength(1));
    expect(server.pages[0].shaping).toEqual(['order:updated_at']);
  });

  // The shaping is read at fetch time, and the loaded rows are kept.
  it('uses the shaping in force at the moment of the fetch, keeping what is loaded', async () => {
    const view = render(<Probe pageSize={2} trailingQuery={byName} />);
    await waitFor(() => expect(current.isSuccess).toBe(true));

    view.rerender(<Probe pageSize={2} trailingQuery={byRecency} />);
    await act(() => current.fetchNextPage());

    expect(server.pages.map((page) => page.shaping)).toEqual([
      ['order:updated_at'],
      ['order:created_at'],
    ]);
    expect(current.data).toHaveLength(4);
  });

  // A different filter is a different result set.
  it('throws away what is loaded when the caller says the shape itself changed', async () => {
    const view = render(<Probe pageSize={2} trailingQuery={byName} trailingQueryKey="all" />);
    await waitFor(() => expect(current.data).toHaveLength(2));

    view.rerender(<Probe pageSize={2} trailingQuery={byRecency} trailingQueryKey="mine" />);

    await waitFor(() => expect(server.pages).toHaveLength(2));
    expect(server.pages[1]).toMatchObject({ from: 0, to: 1, shaping: ['order:created_at'] });
    expect(current.data.map((row) => row.id)).toEqual(['row-0', 'row-1']);
  });
});

describe('rendering on the server', () => {
  // The server snapshot useSyncExternalStore asks for has to be empty, or hydration mismatches.
  it('holds nothing until the browser has had a chance to fetch', () => {
    function ServerProbe() {
      const query = useInfiniteQuery<ConversationRow, 'conversations'>({
        tableName: 'conversations',
      });
      return <span>{`rows:${query.data.length} loading:${query.isLoading}`}</span>;
    }

    const html = renderToString(<ServerProbe />);

    expect(html).toContain('rows:0 loading:false');
    expect(server.pages).toEqual([]);
  });
});

describe('when the read fails', () => {
  it('hands back the reason rather than an empty list that looks like an empty table', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    server.failure = new Error('permission denied for table conversations');
    render(<Probe pageSize={2} />);

    await waitFor(() => expect(current.error).toBe(server.failure));
    expect(current.data).toEqual([]);
    expect(current.isSuccess).toBe(false);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
