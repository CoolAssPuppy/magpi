import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useConversationFolders, type ConversationFolder } from './use-conversation-folders';

type Answer = {
  readonly data: ConversationFolder[] | null;
  readonly error: { readonly message: string } | null;
};

const server = {
  rows: [] as ConversationFolder[],
  failure: null as { message: string } | null,
  reads: [] as string[],
  /** Set to hold the read open, so a sidebar can be torn down mid-answer. */
  gate: null as Promise<void> | null,
};

/** Enough of a PostgREST builder to record what the hook asked for, chained as the real one is. */
function getBuilder(table: string, columns: string) {
  const shaping: string[] = [];
  const builder = {
    order: (column: string) => {
      shaping.push(column);
      return builder;
    },
    then: async (resolve: (answer: Answer) => void) => {
      server.reads.push(`${table}(${columns}) by ${shaping.join(', ')}`);
      if (server.gate) await server.gate;
      resolve({ data: server.failure ? null : server.rows, error: server.failure });
    },
  };
  return builder;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => ({ select: (columns: string) => getBuilder(table, columns) }),
  }),
}));

const getFolder = (overrides: Partial<ConversationFolder> = {}): ConversationFolder => ({
  id: '77777777-7777-4777-8777-777777777777',
  name: 'Pricing',
  color: 'gray',
  ...overrides,
});

function Probe({ reloadKey }: { readonly reloadKey: number }) {
  const { folders, isLoading, error } = useConversationFolders(reloadKey);

  return (
    <div>
      <span data-testid="status">{isLoading ? 'loading' : (error?.message ?? 'read')}</span>
      <ul>
        {folders.map((folder) => (
          <li key={folder.id}>{folder.name}</li>
        ))}
      </ul>
    </div>
  );
}

const status = () => screen.getByTestId('status').textContent;

beforeEach(() => {
  server.rows = [getFolder()];
  server.failure = null;
  server.reads = [];
  server.gate = null;
});

describe('the folders a person made', () => {
  it('reads them in the order the sidebar shows them', async () => {
    render(<Probe reloadKey={0} />);

    await waitFor(() => expect(status()).toBe('read'));
    expect(screen.getByText('Pricing')).toBeInTheDocument();
    expect(server.reads).toEqual(['conversation_folders(id, name, color) by position, name']);
  });

  it('says nothing was read when the read was refused', async () => {
    server.failure = { message: 'permission denied' };
    render(<Probe reloadKey={0} />);

    await waitFor(() => expect(status()).toBe('permission denied'));
    expect(screen.queryByText('Pricing')).toBeNull();
  });

  it('drops an answer that lands after the sidebar is gone', async () => {
    let openTheGate = () => {};
    server.gate = new Promise((resolve) => {
      openTheGate = resolve;
    });

    const { unmount } = render(<Probe reloadKey={0} />);
    unmount();
    openTheGate();

    await waitFor(() => expect(server.reads).toHaveLength(1));
  });

  it('reads them again once the sidebar says a folder changed', async () => {
    const { rerender } = render(<Probe reloadKey={0} />);
    await waitFor(() => expect(status()).toBe('read'));

    server.rows = [getFolder({ name: 'Deals' })];
    rerender(<Probe reloadKey={1} />);

    await waitFor(() => expect(screen.getByText('Deals')).toBeInTheDocument());
    expect(server.reads).toHaveLength(2);
  });
});
