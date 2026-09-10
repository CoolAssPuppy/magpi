'use client';

import { PostgrestQueryBuilder, type PostgrestClientOptions } from '@supabase/postgrest-js';
import { useEffect, useMemo, useSyncExternalStore } from 'react';

import type { Database } from '@/lib/database.types';
import { createClient } from '@/lib/supabase/client';

// The Supabase Library block, with its untyped-client fallback removed.

// Change this to the database schema you want to use
type DatabaseSchema = Database['public'];

// Extracts the table names from the database type
type SupabaseTableName = keyof DatabaseSchema['Tables'];

// Extracts the table definition from the database type
type SupabaseTableData<T extends SupabaseTableName> = DatabaseSchema['Tables'][T]['Row'];

// Default client options for PostgrestQueryBuilder
type DefaultClientOptions = PostgrestClientOptions;

type SupabaseSelectBuilder<T extends SupabaseTableName> = ReturnType<
  PostgrestQueryBuilder<
    DefaultClientOptions,
    DatabaseSchema,
    DatabaseSchema['Tables'][T],
    T
  >['select']
>;

// Modifies the query, for sorting or filtering. A .range call here is overwritten.
type SupabaseQueryHandler<T extends SupabaseTableName> = (
  query: SupabaseSelectBuilder<T>,
) => SupabaseSelectBuilder<T>;

interface UseInfiniteQueryProps<T extends SupabaseTableName> {
  // The table name to query
  tableName: T;
  // The columns to select, defaults to `*`
  columns?: string;
  // The number of items to fetch per page, defaults to `20`
  pageSize?: number;
  // Modifies the query, for sorting or filtering. A .range call here is overwritten.
  trailingQuery?: SupabaseQueryHandler<T>;
  // Identifies the current trailing query shape. Changing it recreates the store.
  trailingQueryKey?: unknown;
}

interface StoreState<TData> {
  data: TData[];
  count: number;
  isSuccess: boolean;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  hasInitialFetch: boolean;
}

type Listener = () => void;

interface StoreProps<T extends SupabaseTableName> {
  tableName: T;
  columns?: string;
  pageSize?: number;
  initialTrailingQuery: SupabaseQueryHandler<T> | undefined;
}

function createStore<TData extends SupabaseTableData<T>, T extends SupabaseTableName>(
  props: StoreProps<T>,
) {
  const { tableName, columns = '*', pageSize = 20, initialTrailingQuery } = props;

  // Owned by the store rather than read out of a ref during render.
  let trailingQuery: SupabaseQueryHandler<T> | undefined = initialTrailingQuery;

  let state: StoreState<TData> = {
    data: [],
    count: 0,
    isSuccess: false,
    isLoading: false,
    isFetching: false,
    error: null,
    hasInitialFetch: false,
  };

  const listeners = new Set<Listener>();

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  const setState = (newState: Partial<StoreState<TData>>) => {
    state = { ...state, ...newState };
    notify();
  };

  const fetchPage = async (skip: number) => {
    if (state.hasInitialFetch && (state.isFetching || state.count <= state.data.length)) return;

    setState({ isFetching: true });

    // Constructed per fetch, because on Fluid compute a hoisted client is shared across requests.
    let query = createClient()
      .from(tableName)
      .select(columns, { count: 'exact' }) as unknown as SupabaseSelectBuilder<T>;

    // Read at fetch time, so a replaced handler applies to the next page.
    if (trailingQuery) {
      query = trailingQuery(query);
    }
    const { data: newData, count, error } = await query.range(skip, skip + pageSize - 1);

    if (error) {
      console.error('An unexpected error occurred:', error);
      setState({ error });
    } else {
      setState({
        data: [...state.data, ...(newData as TData[])],
        count: count || 0,
        isSuccess: true,
        error: null,
      });
    }
    setState({ isFetching: false });
  };

  const fetchNextPage = async () => {
    if (state.isFetching) return;
    await fetchPage(state.data.length);
  };

  const initialize = async () => {
    setState({ isLoading: true, isSuccess: false, data: [] });
    await fetchNextPage();
    setState({ isLoading: false, hasInitialFetch: true });
  };

  return {
    getState: () => state,
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    fetchNextPage,
    initialize,
    setTrailingQuery: (next: SupabaseQueryHandler<T> | undefined) => {
      trailingQuery = next;
    },
  };
}

// Empty initial state to avoid hydration errors.
const initialState: StoreState<never> = {
  data: [],
  count: 0,
  isSuccess: false,
  isLoading: false,
  isFetching: false,
  error: null,
  hasInitialFetch: false,
};

function useInfiniteQuery<
  TData extends SupabaseTableData<T>,
  T extends SupabaseTableName = SupabaseTableName,
>(props: UseInfiniteQueryProps<T>) {
  const tableName = props.tableName;
  const columns = props.columns ?? '*';
  const pageSize = props.pageSize ?? 20;
  const trailingQuery = props.trailingQuery;
  const trailingQueryKey = props.trailingQueryKey;
  const store = useMemo(
    () =>
      createStore<TData, T>({
        tableName,
        columns,
        pageSize,
        initialTrailingQuery: trailingQuery,
      }),
    // A replaced handler reaches the store through setTrailingQuery, so it is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tableName, columns, pageSize, trailingQueryKey],
  );

  // The store owns the current handler, so no ref crosses into render scope.
  useEffect(() => {
    store.setTrailingQuery(trailingQuery);
  }, [store, trailingQuery]);

  const state = useSyncExternalStore(
    store.subscribe,
    () => store.getState(),
    () => initialState as StoreState<TData>,
  );

  useEffect(() => {
    if (!state.hasInitialFetch && typeof window !== 'undefined') {
      store.initialize();
    }
  }, [state.hasInitialFetch, store]);

  return {
    data: state.data,
    count: state.count,
    isSuccess: state.isSuccess,
    isLoading: state.isLoading,
    isFetching: state.isFetching,
    error: state.error,
    hasMore: state.count > state.data.length,
    fetchNextPage: store.fetchNextPage,
  };
}

export { useInfiniteQuery, type SupabaseQueryHandler, type SupabaseTableData };
