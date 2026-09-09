import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';

type QueryState = {
  data: { id: string; title: string | null; updated_at: string }[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
};

const query: QueryState = { data: [], isLoading: false, error: null, hasMore: false };
const fetchNextPage = vi.fn();

vi.mock('next/navigation', () => ({ usePathname: () => '/chat' }));

vi.mock('@/hooks/use-infinite-query', () => ({
  useInfiniteQuery: () => ({ ...query, fetchNextPage }),
}));

vi.mock('./conversation-menu', () => ({
  ConversationMenu: ({ title }: { title: string }) => <span>{`menu for ${title}`}</span>,
}));

const { HistorySidebar } = await import('./history-sidebar');

const user = userEvent.setup({ delay: null });

const conversation = (overrides: Partial<QueryState['data'][number]> = {}) => ({
  id: CONVERSATION_ID,
  title: 'SSO blockers',
  updated_at: '2026-09-09T10:00:00Z',
  ...overrides,
});

beforeEach(() => {
  query.data = [conversation()];
  query.isLoading = false;
  query.error = null;
  query.hasMore = false;
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
});
