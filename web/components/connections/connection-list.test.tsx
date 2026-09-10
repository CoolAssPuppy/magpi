import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { successState } from '@/lib/actions/state';
import type { ProviderListing } from '@/lib/connections/view-model';

import { ConnectionList } from './connection-list';

const getConnectionSummary = (
  overrides?: Partial<ProviderListing['connections'][number]>,
): ProviderListing['connections'][number] => ({
  id: 'conn-1',
  provider: 'notion',
  spaceId: 'space-1',
  spaceName: 'Engineering',
  account: 'Acme workspace',
  scope: 'The whole workspace',
  lastSynced: 'Synced 3 hours ago',
  status: {
    status: 'active',
    label: 'Connected',
    tone: 'positive',
    reason: 'Reading on the usual schedule.',
    recovery: { kind: 'resync', label: 'Sync now' },
  },
  ...overrides,
});

const getListing = (overrides?: Partial<ProviderListing>): ProviderListing => ({
  slug: 'notion',
  displayName: 'Notion',
  description: 'Pages and databases.',
  docsUrl: 'https://developers.notion.com',
  scopeSelectionKind: 'workspace',
  connections: [getConnectionSummary()],
  ...overrides,
});

const SPACES = [
  { id: 'space-1', name: 'Everyone' },
  { id: 'space-2', name: 'Engineering' },
];

const getActions = () => ({
  spaces: SPACES,
  scopes: [],
  onResync: vi.fn().mockResolvedValue(successState(undefined)),
  onDisconnect: vi.fn().mockResolvedValue(successState(undefined)),
  onBegin: vi.fn().mockResolvedValue(successState(undefined)),
  onSaveScope: vi.fn().mockResolvedValue(successState({ kind: 'unset' as const })),
});

describe('the connections list', () => {
  it('names every provider and offers a way in', () => {
    render(
      <ConnectionList
        listings={[
          getListing(),
          getListing({ slug: 'slack', displayName: 'Slack', connections: [] }),
        ]}
        {...getActions()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Notion' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connect slack/i })).toBeInTheDocument();
  });

  // The space is the permission decision, so it is made here rather than on a page in between.
  it('starts the authorization from the list, with the space the reader chose', async () => {
    const actions = getActions();
    render(
      <ConnectionList
        listings={[getListing({ slug: 'slack', displayName: 'Slack', connections: [] })]}
        {...actions}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /connect slack/i }));

    expect(actions.onBegin).toHaveBeenCalledWith('slack', 'space-1');
  });

  it('says which space a connection is bound to and what it reads', () => {
    render(<ConnectionList listings={[getListing()]} {...getActions()} />);

    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText(/the whole workspace/i)).toBeInTheDocument();
    expect(screen.getByText(/synced 3 hours ago/i)).toBeInTheDocument();
  });

  it('gives a revoked connection a real reason and a way to reconnect', () => {
    render(
      <ConnectionList
        listings={[
          getListing({
            connections: [
              getConnectionSummary({
                status: {
                  status: 'revoked',
                  label: 'Access revoked',
                  tone: 'destructive',
                  reason: 'The workspace owner removed Magpi.',
                  recovery: { kind: 'reconnect', label: 'Reconnect' },
                },
              }),
            ],
          }),
        ]}
        {...getActions()}
      />,
    );

    expect(screen.getByText('The workspace owner removed Magpi.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /reconnect/i })).toHaveAttribute(
      'href',
      '/connections/notion?space=space-1',
    );
  });

  it('offers no sync button while a sync is already running', () => {
    render(
      <ConnectionList
        listings={[
          getListing({
            connections: [
              getConnectionSummary({
                status: {
                  status: 'syncing',
                  label: 'Syncing',
                  tone: 'progress',
                  reason: 'Reading from the source now.',
                  recovery: { kind: 'none' },
                },
              }),
            ],
          }),
        ]}
        {...getActions()}
      />,
    );

    expect(screen.queryByRole('button', { name: /sync now/i })).not.toBeInTheDocument();
    expect(screen.getByText('Syncing')).toBeInTheDocument();
  });

  it('runs a full re-sync only when a person asks for one', async () => {
    const actions = getActions();
    render(<ConnectionList listings={[getListing()]} {...actions} />);

    expect(actions.onResync).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /sync now/i }));

    expect(actions.onResync).toHaveBeenCalledWith('conn-1');
  });

  it('says what disconnecting does and does not do before it happens', async () => {
    const actions = getActions();
    render(<ConnectionList listings={[getListing()]} {...actions} />);

    await userEvent.click(screen.getByRole('button', { name: /disconnect/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/documents already imported stay/i)).toBeInTheDocument();
    expect(actions.onDisconnect).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: /^disconnect$/i }));
    expect(actions.onDisconnect).toHaveBeenCalledWith('conn-1');
  });

  it('shows a failed action rather than looking like it worked', async () => {
    const actions = getActions();
    actions.onResync.mockResolvedValue({ status: 'error', message: 'Notion is unreachable.' });
    render(<ConnectionList listings={[getListing()]} {...actions} />);

    await userEvent.click(screen.getByRole('button', { name: /sync now/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Notion is unreachable.');
  });
});
