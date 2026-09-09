import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SyncActivity } from './sync-activity';

type Listener = { table: string; callback: (payload: { new: unknown }) => void };

type FakeChannel = {
  readonly listeners: Listener[];
  on: (event: string, filter: { table: string }, callback: Listener['callback']) => FakeChannel;
  subscribe: () => FakeChannel;
};

const channels: FakeChannel[] = [];
const refresh = vi.fn();
const removeChannel = vi.fn();

const openChannel = (): FakeChannel => {
  const channel: FakeChannel = {
    listeners: [],
    on: (_event, filter, callback) => {
      channel.listeners.push({ table: filter.table, callback });
      return channel;
    },
    subscribe: () => channel,
  };
  channels.push(channel);
  return channel;
};

// One object for the life of the test file, because the real app router hands
// back the same one on every render.
const router = { refresh };

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ channel: () => openChannel(), removeChannel }),
}));

/** Only the live channel hears anything, the same as a real removed channel. */
const emit = (table: string, row: unknown) => {
  const live = channels.at(-1);
  if (!live) throw new Error('nothing has subscribed');
  for (const listener of live.listeners.filter((entry) => entry.table === table)) {
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
  channels.length = 0;
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

    expect(removeChannel).toHaveBeenCalledWith(channels[0]);
  });

  // The parent builds the list of spaces fresh on every render. Tearing the
  // socket down and building a new one each time loses every event that lands
  // in the gap, which is exactly the events this component exists to show.
  it('holds one socket open when the same spaces arrive as a new list', () => {
    const view = render(<SyncActivity spaceIds={['space-1']} />);

    view.rerender(<SyncActivity spaceIds={['space-1']} />);
    view.rerender(<SyncActivity spaceIds={['space-1']} />);

    expect(channels).toHaveLength(1);
    expect(removeChannel).not.toHaveBeenCalled();
  });

  it('watches a space that was added after the screen was up', () => {
    const view = render(<SyncActivity spaceIds={['space-1']} />);

    view.rerender(<SyncActivity spaceIds={['space-1', 'space-2']} />);
    emit('ingest_jobs', getJob({ space_id: 'space-2' }));

    expect(screen.getByText('Importing 1 document')).toBeInTheDocument();
  });
});
