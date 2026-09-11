import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationFolder } from '@/hooks/use-conversation-folders';
import type { ActionState } from '@/lib/actions/state';

const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';
const FOLDER_ID = '55555555-5555-4555-8555-555555555555';

type SidebarRow = { id: string; title: string | null; folder_id: string | null };

type QueryState = {
  data: SidebarRow[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
};

const query: QueryState = { data: [], isLoading: false, error: null, hasMore: false };
const fetchNextPage = vi.fn();
const queryKeys: unknown[] = [];
const sorts: string[] = [];

const folderQuery = {
  folders: [] as ConversationFolder[],
  error: null as Error | null,
  keys: [] as number[],
};

const page = { pathname: '/chat' };

vi.mock('next/navigation', () => ({ usePathname: () => page.pathname }));

type QueryArgs = {
  trailingQueryKey: unknown;
  trailingQuery: (builder: { order: (column: string) => string }) => string;
};

vi.mock('@/hooks/use-infinite-query', () => ({
  useInfiniteQuery: ({ trailingQueryKey, trailingQuery }: QueryArgs) => {
    queryKeys.push(trailingQueryKey);
    sorts.push(trailingQuery({ order: (column) => column }));
    return { ...query, fetchNextPage };
  },
}));

vi.mock('@/hooks/use-conversation-folders', () => ({
  useConversationFolders: (reloadKey: number) => {
    folderQuery.keys.push(reloadKey);
    return { folders: folderQuery.folders, isLoading: false, error: folderQuery.error };
  },
}));

vi.mock('@/app/(app)/chat/actions', () => ({
  createFolderAction: async () => ({ status: 'success', data: FOLDER_ID }) as ActionState<string>,
  renameFolderAction: async () => ({ status: 'success', data: 'Pricing' }) as ActionState<string>,
  deleteFolderAction: async () => ({ status: 'success', data: FOLDER_ID }) as ActionState<string>,
}));

vi.mock('./conversation-menu', () => ({
  ConversationMenu: ({ title }: { title: string }) => <span>{`menu for ${title}`}</span>,
}));

const { HistorySidebar } = await import('./history-sidebar');

const user = userEvent.setup({ delay: null });

const conversation = (overrides: Partial<SidebarRow> = {}): SidebarRow => ({
  id: CONVERSATION_ID,
  title: 'SSO blockers',
  folder_id: null,
  ...overrides,
});

const folder = (overrides: Partial<ConversationFolder> = {}): ConversationFolder => ({
  id: FOLDER_ID,
  name: 'Pricing',
  color: 'gray',
  ...overrides,
});

beforeEach(() => {
  query.data = [conversation()];
  query.isLoading = false;
  query.error = null;
  query.hasMore = false;
  folderQuery.folders = [];
  folderQuery.error = null;
  folderQuery.keys = [];
  queryKeys.length = 0;
  sorts.length = 0;
  page.pathname = '/chat';
  fetchNextPage.mockClear();
});

describe('HistorySidebar', () => {
  it('links each conversation to itself', () => {
    render(<HistorySidebar />);

    expect(screen.getByRole('link', { name: 'SSO blockers' })).toHaveAttribute(
      'href',
      `/chat/${CONVERSATION_ID}`,
    );
  });

  it('puts the newest conversation first', () => {
    render(<HistorySidebar />);

    expect(sorts).toContain('updated_at');
  });

  it('marks the conversation that is open', () => {
    page.pathname = `/chat/${CONVERSATION_ID}`;
    render(<HistorySidebar />);

    expect(screen.getByRole('link', { name: 'SSO blockers' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('names a conversation that never got a title', () => {
    query.data = [conversation({ title: null })];
    render(<HistorySidebar />);

    expect(screen.getByRole('link', { name: 'Untitled conversation' })).toBeInTheDocument();
  });

  it('says the history is empty rather than showing nothing', () => {
    query.data = [];
    render(<HistorySidebar />);

    expect(screen.getByText('Nothing asked yet.')).toBeInTheDocument();
  });

  it('says it is loading before the first page lands', () => {
    query.isLoading = true;
    render(<HistorySidebar />);

    expect(screen.getByText('Loading your conversations...')).toBeInTheDocument();
  });

  it('says so when the history could not be read', () => {
    query.error = new Error('permission denied');
    render(<HistorySidebar />);

    expect(screen.getByText('Your conversations could not be loaded.')).toBeInTheDocument();
  });

  it('reaches for older conversations on request', async () => {
    query.hasMore = true;
    render(<HistorySidebar />);

    await user.click(screen.getByRole('button', { name: 'Show older' }));

    expect(fetchNextPage).toHaveBeenCalled();
  });

  it('shows a filed conversation under its folder', () => {
    folderQuery.folders = [folder()];
    query.data = [conversation({ folder_id: FOLDER_ID })];
    render(<HistorySidebar />);

    const section = within(screen.getByRole('region', { name: 'Pricing' }));
    expect(section.getByRole('link', { name: 'SSO blockers' })).toBeInTheDocument();
  });

  it('leaves an unfiled conversation at the top level', () => {
    folderQuery.folders = [folder()];
    query.data = [conversation({ folder_id: null })];
    render(<HistorySidebar />);

    const section = within(screen.getByRole('region', { name: 'Pricing' }));
    expect(section.queryByRole('link', { name: 'SSO blockers' })).toBeNull();
    expect(screen.getByRole('link', { name: 'SSO blockers' })).toBeInTheDocument();
  });

  it('shows a conversation at the top level when its folder is not one it can see', () => {
    folderQuery.folders = [folder()];
    query.data = [conversation({ folder_id: '99999999-9999-4999-8999-999999999999' })];
    render(<HistorySidebar />);

    const section = within(screen.getByRole('region', { name: 'Pricing' }));
    expect(section.queryByRole('link', { name: 'SSO blockers' })).toBeNull();
    expect(screen.getByRole('link', { name: 'SSO blockers' })).toBeInTheDocument();
  });

  it('keeps showing a folder holding nothing, because someone made it on purpose', () => {
    folderQuery.folders = [folder({ name: 'Empty' })];
    query.data = [];
    render(<HistorySidebar />);

    const section = within(screen.getByRole('region', { name: 'Empty' }));
    expect(section.getByText('Nothing filed here yet.')).toBeInTheDocument();
    expect(screen.queryByText('Nothing asked yet.')).toBeNull();
  });

  it('says so when the folders could not be read, and shows the conversations anyway', () => {
    folderQuery.error = new Error('permission denied');
    render(<HistorySidebar />);

    expect(screen.getByText('Your folders could not be loaded.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'SSO blockers' })).toBeInTheDocument();
  });

  it('reads the folders and the conversations again after a folder is made', async () => {
    render(<HistorySidebar />);

    await user.click(screen.getByRole('button', { name: 'New folder' }));
    await user.type(screen.getByLabelText('Name'), 'Pricing');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(folderQuery.keys.at(-1)).toBe(1);
    expect(queryKeys.at(-1)).toBe(1);
  });
});
