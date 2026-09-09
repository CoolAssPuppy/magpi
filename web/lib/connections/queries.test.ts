import { describe, expect, it, vi } from 'vitest';

import { recordingContext } from '@/lib/supabase/test-support';

vi.mock('server-only', () => ({}));

const { loadConnectionsPage, loadProviderScreen } = await import('./queries');

const SPACE_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_SPACE_ID = '33333333-3333-4333-8333-444444444444';
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';

type Provider = {
  slug: string;
  display_name: string;
  description: string;
  docs_url: string | null;
  enabled: boolean;
  position: number;
  scope_selection_kind: string | null;
};

const getProvider = (overrides: Partial<Provider> = {}): Provider => ({
  slug: 'slack',
  display_name: 'Slack',
  description: 'Channels and threads.',
  docs_url: 'https://api.slack.com',
  enabled: true,
  position: 2,
  scope_selection_kind: 'channel',
  ...overrides,
});

type Connection = {
  id: string;
  provider: string;
  space_id: string;
  user_id: string;
  external_account_id: string | null;
  status: 'active' | 'syncing' | 'error' | 'revoked' | 'expired';
  status_detail: string | null;
  last_synced_at: string | null;
  scope_selection: unknown;
};

const getConnection = (overrides: Partial<Connection> = {}): Connection => ({
  id: CONNECTION_ID,
  provider: 'slack',
  space_id: SPACE_ID,
  user_id: '77777777-7777-4777-8777-777777777777',
  external_account_id: 'Acme workspace',
  status: 'active',
  status_detail: null,
  last_synced_at: '2026-09-09T11:00:00.000Z',
  scope_selection: {},
  ...overrides,
});

type Space = { id: string; name: string; kind: 'personal' | 'org' };

const getSpace = (overrides: Partial<Space> = {}): Space => ({
  id: SPACE_ID,
  name: 'Engineering',
  kind: 'org',
  ...overrides,
});

const populatedScope = {
  kind: 'channel',
  available: [
    { id: 'C1', name: 'general' },
    { id: 'C2', name: 'engineering' },
  ],
  selected: ['C1'],
};

function selectArgument(calls: readonly (readonly [string, ...unknown[]])[]): string {
  const select = calls.find((call) => call[0] === 'select');
  if (!select) throw new Error('the query asked for no columns');
  return String(select[1]);
}

describe('the connections page', () => {
  it('lists every provider with the connections the caller already has', async () => {
    const { context } = recordingContext({
      responses: {
        providers: [{ data: [getProvider()] }],
        connections: [{ data: [getConnection()] }],
        spaces: [{ data: [getSpace()] }],
      },
    });

    const page = await loadConnectionsPage(context);

    expect(page.listings).toHaveLength(1);
    expect(page.listings[0].displayName).toBe('Slack');
    expect(page.listings[0].connections[0].spaceName).toBe('Engineering');
    expect(page.listings[0].connections[0].account).toBe('Acme workspace');
    expect(page.spaceIds).toEqual([SPACE_ID]);
  });

  it('never asks for the stored tokens, only for the columns a screen renders', async () => {
    const { context, callsFor } = recordingContext({
      responses: {
        providers: [{ data: [] }],
        connections: [{ data: [] }],
        spaces: [{ data: [] }],
      },
    });

    await loadConnectionsPage(context);

    const columns = selectArgument(callsFor('connections'));
    expect(columns).not.toContain('*');
    expect(columns).not.toContain('access_token_enc');
    expect(columns).not.toContain('refresh_token_enc');
  });

  it('drops a connection whose space left the caller between the two reads', async () => {
    const { context } = recordingContext({
      responses: {
        providers: [{ data: [getProvider()] }],
        connections: [{ data: [getConnection({ space_id: OTHER_SPACE_ID })] }],
        spaces: [{ data: [getSpace()] }],
      },
    });

    const page = await loadConnectionsPage(context);

    expect(page.listings[0].connections).toEqual([]);
  });

  it('throws when the provider table is refused, rather than showing no sources', async () => {
    const { context } = recordingContext({
      responses: {
        providers: [{ error: { message: 'permission denied for table providers' } }],
        connections: [{ data: [] }],
        spaces: [{ data: [] }],
      },
    });

    await expect(loadConnectionsPage(context)).rejects.toThrow(
      'permission denied for table providers',
    );
  });

  it('throws when connections are refused, rather than reading as disconnected', async () => {
    const { context } = recordingContext({
      responses: {
        providers: [{ data: [] }],
        connections: [{ error: { message: 'permission denied for table connections' } }],
        spaces: [{ data: [] }],
      },
    });

    await expect(loadConnectionsPage(context)).rejects.toThrow(
      'permission denied for table connections',
    );
  });

  it('throws when spaces are refused, rather than offering nowhere to connect', async () => {
    const { context } = recordingContext({
      responses: {
        providers: [{ data: [] }],
        connections: [{ data: [] }],
        spaces: [{ error: { message: 'permission denied for table spaces' } }],
      },
    });

    await expect(loadConnectionsPage(context)).rejects.toThrow('permission denied for table spaces');
  });
});

describe('one provider screen', () => {
  it('answers with nothing for a slug that names no provider', async () => {
    const { context } = recordingContext({
      responses: {
        providers: [{ data: null }],
        connections: [{ data: [] }],
        spaces: [{ data: [] }],
      },
    });

    expect(await loadProviderScreen(context, 'mailchimp')).toBeNull();
  });

  it('asks only for that provider, and only for the connections that belong to it', async () => {
    const { context, callsFor } = recordingContext({
      responses: {
        providers: [{ data: getProvider() }],
        connections: [{ data: [] }],
        spaces: [{ data: [] }],
      },
    });

    await loadProviderScreen(context, 'slack');

    expect(callsFor('providers')).toContainEqual(['eq', 'slug', 'slack']);
    expect(callsFor('connections')).toContainEqual(['eq', 'provider', 'slack']);
  });

  it('says which space each connection reads into, and what state it is in', async () => {
    const { context } = recordingContext({
      responses: {
        providers: [{ data: getProvider() }],
        connections: [
          {
            data: [
              getConnection({
                status: 'expired',
                status_detail: 'The Slack token expired.',
                scope_selection: populatedScope,
              }),
            ],
          },
        ],
        spaces: [{ data: [getSpace()] }],
      },
    });

    const screen = await loadProviderScreen(context, 'slack');

    expect(screen?.connections).toEqual([
      {
        id: CONNECTION_ID,
        spaceId: SPACE_ID,
        spaceName: 'Engineering',
        account: 'Acme workspace',
        status: {
          status: 'expired',
          label: 'Access expired',
          tone: 'warning',
          reason: 'The Slack token expired.',
          recovery: { kind: 'reconnect', label: 'Reconnect' },
        },
        selection: {
          kind: 'set',
          selectionKind: 'channel',
          available: [
            { id: 'C1', name: 'general' },
            { id: 'C2', name: 'engineering' },
          ],
          selected: ['C1'],
        },
      },
    ]);
  });

  it('drops a connection whose space left the caller between the two reads', async () => {
    const { context } = recordingContext({
      responses: {
        providers: [{ data: getProvider() }],
        connections: [{ data: [getConnection({ space_id: OTHER_SPACE_ID })] }],
        spaces: [{ data: [getSpace()] }],
      },
    });

    const screen = await loadProviderScreen(context, 'slack');

    expect(screen?.connections).toEqual([]);
  });

  it('says the account was not recorded rather than showing a blank name', async () => {
    const { context } = recordingContext({
      responses: {
        providers: [{ data: getProvider() }],
        connections: [{ data: [getConnection({ external_account_id: null })] }],
        spaces: [{ data: [getSpace()] }],
      },
    });

    const screen = await loadProviderScreen(context, 'slack');

    expect(screen?.connections[0].account).toBe('Account not recorded');
  });

  it('reads a stored scope the app cannot parse as nothing chosen yet', async () => {
    const { context } = recordingContext({
      responses: {
        providers: [{ data: getProvider() }],
        connections: [{ data: [getConnection({ scope_selection: { kind: 'mailbox' } })] }],
        spaces: [{ data: [getSpace()] }],
      },
    });

    const screen = await loadProviderScreen(context, 'slack');

    expect(screen?.connections[0].selection).toEqual({ kind: 'unset' });
  });

  it('offers every space the caller holds, not only the ones already connected', async () => {
    const { context } = recordingContext({
      responses: {
        providers: [{ data: getProvider() }],
        connections: [{ data: [] }],
        spaces: [{ data: [getSpace(), getSpace({ id: OTHER_SPACE_ID, name: 'Personal' })] }],
      },
    });

    const screen = await loadProviderScreen(context, 'slack');

    expect(screen?.spaces.map((space) => space.name)).toEqual(['Engineering', 'Personal']);
  });
});
