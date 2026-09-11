import { describe, expect, it } from 'vitest';

import { buildProviderListings } from './view-model';
import type { ConnectionRecord, ProviderRecord, SpaceRecord } from './view-model';

const ENGINEERING = '33333333-3333-4333-8333-333333333333';
const FINANCE = '44444444-4444-4444-8444-444444444444';
const UNSEEN = '55555555-5555-4555-8555-555555555555';

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
  external_account_id: 'Acme workspace',
  status: 'active',
  status_detail: null,
  last_synced_at: '2026-09-09T11:00:00.000Z',
  scope_selection: {},
  ...overrides,
});

const getSpace = (overrides?: Partial<SpaceRecord>): SpaceRecord => ({
  id: ENGINEERING,
  name: 'Engineering',
  kind: 'personal',
  ...overrides,
});

const getFinance = () => getSpace({ id: FINANCE, name: 'Finance', kind: 'team' });

// Two channels of one Slack account, each sent somewhere different.
const getSplitScope = (routes: Readonly<Record<string, string>>) => ({
  kind: 'channel',
  available: [
    { id: 'C1', name: 'general' },
    { id: 'C2', name: 'design' },
  ],
  routes,
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

  it('orders two providers at the same position by name, so the page never reshuffles', () => {
    const listings = buildProviderListings({
      providers: [
        getProvider({ slug: 'slack', display_name: 'Slack', position: 2 }),
        getProvider({ slug: 'drive', display_name: 'Drive', position: 2 }),
      ],
      connections: [],
      spaces: [getSpace()],
      now: NOW,
    });

    expect(listings.map((listing) => listing.slug)).toEqual(['drive', 'slack']);
  });

  // It used to be dropped. A demo needs to show what a knowledge base can read from, and the page
  // marks a provider nobody has wired up rather than offering a button that would fail.
  it('keeps a provider that is not enabled yet, and says so', () => {
    const listings = buildProviderListings({
      providers: [getProvider({ slug: 'drive', enabled: false })],
      connections: [],
      spaces: [getSpace()],
      now: NOW,
    });

    expect(listings).toHaveLength(1);
    expect(listings[0].enabled).toBe(false);
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

  it('names the space a routed unit lands in', () => {
    const listings = buildProviderListings({
      providers: [getProvider()],
      connections: [getConnection({ scope_selection: getSplitScope({ C1: FINANCE }) })],
      spaces: [getSpace(), getFinance()],
      now: NOW,
    });

    expect(listings[0].connections[0].destinations).toEqual(['Finance']);
  });

  it('sends one channel of an account to Engineering and another to Finance', () => {
    const listings = buildProviderListings({
      providers: [getProvider()],
      connections: [
        getConnection({ scope_selection: getSplitScope({ C1: ENGINEERING, C2: FINANCE }) }),
      ],
      spaces: [getSpace(), getFinance()],
      now: NOW,
    });

    const summary = listings[0].connections[0];
    expect(summary.destinations).toEqual(['Engineering', 'Finance']);
    expect(summary.scope).toBe('2 of 2 channels into 2 spaces');
  });

  it('names each destination once when two units land in the same space', () => {
    const listings = buildProviderListings({
      providers: [getProvider()],
      connections: [
        getConnection({ scope_selection: getSplitScope({ C1: FINANCE, C2: FINANCE }) }),
      ],
      spaces: [getSpace(), getFinance()],
      now: NOW,
    });

    expect(listings[0].connections[0].destinations).toEqual(['Finance']);
  });

  // RLS lets the whole row through once one route reaches a space the reader is in. The route to
  // the space they are not in must not reach the screen, in the name or in the routing it edits.
  it('hides a route to a space the reader is not in, and keeps the rest of the connection', () => {
    const listings = buildProviderListings({
      providers: [getProvider()],
      connections: [
        getConnection({ scope_selection: getSplitScope({ C1: ENGINEERING, C2: UNSEEN }) }),
      ],
      spaces: [getSpace()],
      now: NOW,
    });

    const summary = listings[0].connections[0];
    expect(summary.destinations).toEqual(['Engineering']);
    expect(summary.selection).toEqual(expect.objectContaining({ routes: { C1: ENGINEERING } }));
    expect(summary.scope).toBe('1 of 2 channels into 1 space');
  });

  it('keeps a connection whose every route is to a space the reader is not in, routed nowhere', () => {
    const listings = buildProviderListings({
      providers: [getProvider()],
      connections: [getConnection({ scope_selection: getSplitScope({ C1: UNSEEN }) })],
      spaces: [getSpace()],
      now: NOW,
    });

    const summary = listings[0].connections[0];
    expect(summary.destinations).toEqual([]);
    expect(summary.selection).toEqual(expect.objectContaining({ routes: {} }));
    expect(summary.scope).toBe('No channels routed');
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
        getConnection({
          id: 'conn-2',
          external_account_id: 'Personal',
          scope_selection: getSplitScope({ C1: FINANCE }),
        }),
      ],
      spaces: [getSpace(), getFinance()],
      now: NOW,
    });

    expect(listings[0].connections.map((c) => c.id)).toEqual(['conn-1', 'conn-2']);
    expect(listings[0].connections[1].destinations).toEqual(['Finance']);
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

  it('summarises the routing a connection reads', () => {
    const listings = buildProviderListings({
      providers: [getProvider({ scope_selection_kind: 'channel' })],
      connections: [getConnection({ scope_selection: getSplitScope({ C1: ENGINEERING }) })],
      spaces: [getSpace()],
      now: NOW,
    });

    expect(listings[0].connections[0].scope).toBe('1 of 2 channels into 1 space');
  });

  it('reads a stored shape it cannot parse as nothing chosen, rather than guessing a routing', () => {
    const listings = buildProviderListings({
      providers: [getProvider()],
      connections: [getConnection({ scope_selection: { kind: 'mailbox' } })],
      spaces: [getSpace()],
      now: NOW,
    });

    expect(listings[0].connections[0].selection).toEqual({ kind: 'unset' });
    expect(listings[0].connections[0].destinations).toEqual([]);
    expect(listings[0].connections[0].scope).toBe('Nothing chosen yet');
  });
});
