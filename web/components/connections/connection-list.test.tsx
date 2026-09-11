import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { successState } from '@/lib/actions/state';
import type { ProviderListing } from '@/lib/connections/view-model';

import { ConnectionList } from './connection-list';

const EVERYONE = '11111111-1111-4111-8111-111111111111';
const ENGINEERING = '33333333-3333-4333-8333-333333333333';
const FINANCE = '44444444-4444-4444-8444-444444444444';

const getConnectionSummary = (
  overrides?: Partial<ProviderListing['connections'][number]>,
): ProviderListing['connections'][number] => ({
  id: 'conn-1',
  provider: 'notion',
  account: 'Acme workspace',
  destinations: ['Engineering'],
  scope: '1 of 1 workspaces into 1 space',
  lastSynced: 'Synced 3 hours ago',
  status: {
    status: 'active',
    label: 'Connected',
    tone: 'positive',
    reason: 'Reading on the usual schedule.',
    recovery: { kind: 'resync', label: 'Sync now' },
  },
  selection: { kind: 'unset' },
  ...overrides,
});

const getListing = (overrides?: Partial<ProviderListing>): ProviderListing => ({
  slug: 'notion',
  displayName: 'Notion',
  description: 'Pages and databases.',
  docsUrl: 'https://developers.notion.com',
  scopeSelectionKind: 'workspace',
  enabled: true,
  connections: [getConnectionSummary()],
  ...overrides,
});

const SPACES = [
  { id: EVERYONE, name: 'Everyone' },
  { id: ENGINEERING, name: 'Engineering' },
  { id: FINANCE, name: 'Finance' },
];

const getActions = () => ({
  spaces: SPACES,
  onResync: vi.fn().mockResolvedValue(successState(undefined)),
  onDisconnect: vi.fn().mockResolvedValue(successState(undefined)),
  onBegin: vi.fn().mockResolvedValue(successState(undefined)),
  onSaveScope: vi.fn().mockResolvedValue(successState({ kind: 'unset' as const })),
});

describe('the connections list', () => {
  it('marks a provider that is not wired up rather than offering a button that would fail', () => {
    render(
      <ConnectionList
        listings={[
          getListing({ slug: 'hubspot', displayName: 'HubSpot', enabled: false, connections: [] }),
        ]}
        {...getActions()}
      />,
    );

    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /connect hubspot/i })).not.toBeInTheDocument();
  });

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

  // Authorizing the account is the whole step. Where its units land is chosen on the row after.
  it('starts the authorization from the list, naming only the source', async () => {
    const actions = getActions();
    render(
      <ConnectionList
        listings={[getListing({ slug: 'slack', displayName: 'Slack', connections: [] })]}
        {...actions}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /connect slack/i }));

    expect(actions.onBegin).toHaveBeenCalledWith('slack');
  });

  it('says which spaces a connection feeds, and what it routes, once each', () => {
    render(
      <ConnectionList
        listings={[
          getListing({
            connections: [
              getConnectionSummary({
                destinations: ['Engineering', 'Finance'],
                selection: {
                  kind: 'set',
                  selectionKind: 'channel',
                  available: [
                    { id: 'C1', name: '#one' },
                    { id: 'C2', name: '#two' },
                  ],
                  routes: { C1: ENGINEERING, C2: FINANCE },
                },
              }),
            ],
          }),
        ]}
        {...getActions()}
      />,
    );

    expect(screen.getByText('into Engineering, Finance')).toBeInTheDocument();
    expect(screen.getByText(/synced 3 hours ago/i)).toBeInTheDocument();
    // The routing summary belongs to the picker, so the row above must not repeat it.
    expect(screen.getAllByText(/2 of 2 channels into 2 spaces/)).toHaveLength(1);
  });

  it('says a connection nobody reads is routed nowhere, rather than showing a blank', () => {
    render(
      <ConnectionList
        listings={[
          getListing({
            connections: [getConnectionSummary({ destinations: [], scope: 'No channels routed' })],
          }),
        ]}
        {...getActions()}
      />,
    );

    expect(screen.getByText('not routed anywhere')).toBeInTheDocument();
  });

  it('gives a revoked connection a real reason and a way to reconnect', async () => {
    const actions = getActions();
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
        {...actions}
      />,
    );

    expect(screen.getByText('The workspace owner removed Magpi.')).toBeInTheDocument();

    // Reconnecting authorizes the account again. There is no per-provider page to send them to.
    await userEvent.click(screen.getByRole('button', { name: /reconnect/i }));
    expect(actions.onBegin).toHaveBeenCalledWith('notion');
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

  it('saves the routing a person edited on the row, against that connection', async () => {
    const actions = getActions();
    render(
      <ConnectionList
        listings={[
          getListing({
            connections: [
              getConnectionSummary({
                selection: {
                  kind: 'set',
                  selectionKind: 'channel',
                  available: [{ id: 'C1', name: 'general' }],
                  routes: {},
                },
              }),
            ],
          }),
        ]}
        {...actions}
      />,
    );

    // Radix keeps its options out of the DOM until the trigger opens.
    await userEvent.click(screen.getByRole('combobox', { name: 'Space for general' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Engineering' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save routing' }));

    expect(actions.onSaveScope).toHaveBeenCalledWith('conn-1', { C1: ENGINEERING });
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
