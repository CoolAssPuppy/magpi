import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SyncActivity } from './sync-activity';

type Listener = { table: string; callback: (payload: { new: unknown }) => void };

const listeners: Listener[] = [];
const refresh = vi.fn();
const removeChannel = vi.fn();

const channel = {
  on: vi.fn((_event: string, filter: { table: string }, callback: Listener['callback']) => {
    listeners.push({ table: filter.table, callback });
    return channel;
  }),
  subscribe: vi.fn(() => channel),
};

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ channel: () => channel, removeChannel }),
}));

const emit = (table: string, row: unknown) => {
  for (const listener of listeners.filter((entry) => entry.table === table)) {
    act(() => listener.callback({ new: row }));
  }
};

const getJob = (overrides?: Record<string, unknown>) => ({
  id: 'job-1',
  space_id: 'space-1',
  document_id: 'doc-1',
  stage: 'embed',
  status: 'running',
  error: null,
  ...overrides,
});

beforeEach(() => {
  listeners.length = 0;
  refresh.mockClear();
  removeChannel.mockClear();
});

describe('live import activity', () => {
  it('says nothing while nothing is happening', () => {
    render(<SyncActivity spaceIds={['space-1']} />);

    expect(screen.queryByText(/importing/i)).not.toBeInTheDocument();
  });

  it('shows an import as it runs', () => {
    render(<SyncActivity spaceIds={['space-1']} />);

    emit('ingest_jobs', getJob());

    expect(screen.getByText('Importing 1 document')).toBeInTheDocument();
  });

  it('shows a failed import with its reason, rather than a spinner that never resolves', () => {
    render(<SyncActivity spaceIds={['space-1']} />);

    emit('ingest_jobs', getJob({ status: 'timeout', stage: 'extract' }));

    expect(screen.getByText('Timed out during extract.')).toBeInTheDocument();
  });

  it('ignores an import in a space this page is not watching', () => {
    render(<SyncActivity spaceIds={['space-1']} />);

    emit('ingest_jobs', getJob({ space_id: 'space-other' }));

    expect(screen.queryByText(/importing/i)).not.toBeInTheDocument();
  });

  it('reads the page again when a connection changes status', () => {
    render(<SyncActivity spaceIds={['space-1']} />);

    emit('connections', { id: 'conn-1' });

    expect(refresh).toHaveBeenCalled();
  });

  it('lets go of the channel when the screen goes away', () => {
    const view = render(<SyncActivity spaceIds={['space-1']} />);

    view.unmount();

    expect(removeChannel).toHaveBeenCalledWith(channel);
  });
});
