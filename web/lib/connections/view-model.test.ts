import { describe, expect, it } from 'vitest';

import { buildProviderListings, countConnections } from './view-model';
import type { ConnectionRecord, ProviderRecord, SpaceRecord } from './view-model';

const getProvider = (overrides?: Partial<ProviderRecord>): ProviderRecord => ({
  slug: 'notion',
  display_name: 'Notion',
  description: 'Pages and databases.',
  docs_url: 'https://developers.notion.com',
  enabled: true,
  position: 1,
  scope_selection_kind: 'workspace',
  ...overrides,
});

const getConnection = (overrides?: Partial<ConnectionRecord>): ConnectionRecord => ({
  id: 'conn-1',
  provider: 'notion',
  space_id: 'space-1',
  external_account_id: 'Acme workspace',
  status: 'active',
  status_detail: null,
  last_synced_at: '2026-09-09T11:00:00.000Z',
  scope_selection: {},
  ...overrides,
});

const getSpace = (overrides?: Partial<SpaceRecord>): SpaceRecord => ({
  id: 'space-1',
  name: 'Personal',
  kind: 'personal',
  ...overrides,
});

const NOW = new Date('2026-09-09T12:00:00.000Z');

describe('provider listings', () => {
  it('lists every enabled provider, in the order the table gives', () => {
    const listings = buildProviderListings({
      providers: [
        getProvider({ slug: 'slack', display_name: 'Slack', position: 3 }),
        getProvider({ slug: 'notion', display_name: 'Notion', position: 1 }),
      ],
      connections: [],
      spaces: [getSpace()],
      now: NOW,
    });

    expect(listings.map((listing) => listing.slug)).toEqual(['notion', 'slack']);
  });

  it('leaves out a provider that is not enabled yet', () => {
    const listings = buildProviderListings({
      providers: [getProvider({ slug: 'drive', enabled: false })],
      connections: [],
      spaces: [getSpace()],
      now: NOW,
    });

    expect(listings).toEqual([]);
  });

  it('keeps a disabled provider a user is already connected to, so the connection is not stranded', () => {
    const listings = buildProviderListings({
      providers: [getProvider({ slug: 'drive', display_name: 'Drive', enabled: false })],
      connections: [getConnection({ provider: 'drive' })],
      spaces: [getSpace()],
      now: NOW,
    });

    expect(listings).toHaveLength(1);
    expect(listings[0].connections).toHaveLength(1);
  });

  it('names the space a connection is bound to', () => {
    const listings = buildProviderListings({
      providers: [getProvider()],
      connections: [getConnection({ space_id: 'space-2' })],
      spaces: [getSpace(), getSpace({ id: 'space-2', name: 'Engineering', kind: 'team' })],
      now: NOW,
    });

    expect(listings[0].connections[0].spaceName).toBe('Engineering');
  });

  it('drops a connection whose space the caller cannot see', () => {
    const listings = buildProviderListings({
      providers: [getProvider()],
      connections: [getConnection({ space_id: 'space-gone' })],
      spaces: [getSpace()],
      now: NOW,
    });

    expect(listings[0].connections).toEqual([]);
  });

  it('carries the failure reason through to the connection it belongs to', () => {
    const listings = buildProviderListings({
      providers: [getProvider()],
      connections: [
        getConnection({ status: 'revoked', status_detail: 'Token revoked in Notion.' }),
      ],
      spaces: [getSpace()],
      now: NOW,
    });

    expect(listings[0].connections[0].status.reason).toBe('Token revoked in Notion.');
    expect(listings[0].connections[0].status.recovery.kind).toBe('reconnect');
  });

  it('holds several connections to the same provider, because a person connects two workspaces', () => {
    const listings = buildProviderListings({
      providers: [getProvider()],
      connections: [
        getConnection({ id: 'conn-1', external_account_id: 'Acme' }),
        getConnection({ id: 'conn-2', external_account_id: 'Personal', space_id: 'space-2' }),
      ],
      spaces: [getSpace(), getSpace({ id: 'space-2', name: 'Engineering', kind: 'team' })],
      now: NOW,
    });

    expect(listings[0].connections.map((c) => c.id)).toEqual(['conn-1', 'conn-2']);
  });

  it('says which account a connection reads when the provider recorded one', () => {
    const listings = buildProviderListings({
      providers: [getProvider()],
      connections: [getConnection({ external_account_id: null })],
      spaces: [getSpace()],
      now: NOW,
    });

    expect(listings[0].connections[0].account).toBe('Account not recorded');
  });

  it('summarises the scope a connection reads', () => {
    const listings = buildProviderListings({
      providers: [getProvider({ scope_selection_kind: 'channel' })],
      connections: [
        getConnection({
          scope_selection: {
            kind: 'channel',
            available: [
              { id: 'C1', name: 'general' },
              { id: 'C2', name: 'design' },
            ],
            selected: ['C1'],
          },
        }),
      ],
      spaces: [getSpace()],
      now: NOW,
    });

    expect(listings[0].connections[0].scope).toBe('1 of 2 channels');
  });

  it('says the scope is unreadable rather than guessing when the stored shape is wrong', () => {
    const listings = buildProviderListings({
      providers: [getProvider()],
      connections: [getConnection({ scope_selection: { kind: 'mailbox' } })],
      spaces: [getSpace()],
      now: NOW,
    });

    expect(listings[0].connections[0].scope).toBe('Scope could not be read');
  });
});

describe('counting connections', () => {
  it('counts across every provider, which is what decides the empty state', () => {
    const listings = buildProviderListings({
      providers: [getProvider(), getProvider({ slug: 'slack', position: 2 })],
      connections: [getConnection(), getConnection({ id: 'conn-2', provider: 'slack' })],
      spaces: [getSpace()],
      now: NOW,
    });

    expect(countConnections(listings)).toBe(2);
  });

  it('counts nothing on day one', () => {
    expect(countConnections([])).toBe(0);
  });
});
