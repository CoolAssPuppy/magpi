import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionState } from '@/lib/actions/state';
import type { SessionContext } from '@/lib/supabase/context';
import {
  recordingContext,
  type RecordingContext,
  type StubResponse,
} from '@/lib/supabase/test-support';

const SPACE_ID = '33333333-3333-4333-8333-333333333333';
const FINANCE_ID = '44444444-4444-4444-8444-444444444444';
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';
const AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize?state=abc';

const caller = {
  signedIn: true,
  database: null as RecordingContext | null,
  revalidated: [] as string[],
  sentTo: [] as string[],
};

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    caller.sentTo.push(url);
  },
}));

vi.mock('@/lib/actions/with-session', () => ({
  withSession: async <T>(
    run: (context: SessionContext) => Promise<ActionState<T>>,
    revalidate: string,
  ): Promise<ActionState<T>> => {
    if (!caller.signedIn) return { status: 'error', message: 'You need to sign in to do that.' };

    const database = caller.database;
    if (!database) throw new Error('this test queued no database');

    const result = await run(database.context);
    if (result.status === 'success') caller.revalidated.push(revalidate);
    return result;
  },
}));

const {
  claimPendingConnection,
  disconnectConnection,
  resyncConnection,
  saveScopeSelection,
  startConnection,
} = await import('./actions');

function database(responses: Record<string, readonly StubResponse[]>): RecordingContext {
  const recorder = recordingContext({ responses });
  caller.database = recorder;
  return recorder;
}

const getScope = (routes: Readonly<Record<string, string>>) => ({
  kind: 'channel',
  available: [
    { id: 'C1', name: 'general' },
    { id: 'C2', name: 'engineering' },
  ],
  routes,
});

beforeEach(() => {
  caller.signedIn = true;
  caller.database = null;
  caller.revalidated = [];
  caller.sentTo = [];
});

describe('authorizing a source', () => {
  it('sends the person to the provider, and asks to be returned to the connections list', async () => {
    const { callsFor } = database({
      'connections-begin': [{ data: { authorize_url: AUTHORIZE_URL } }],
    });

    const state = await startConnection('slack');

    expect(state).toEqual({ status: 'success', data: undefined });
    expect(caller.sentTo).toEqual([AUTHORIZE_URL]);
    expect(callsFor('connections-begin')).toEqual([
      [
        'invoke',
        'connections-begin',
        { provider: 'slack', return_to: '/connections?provider=slack' },
      ],
    ]);
  });

  // A connection is one authorized account. Which space each of its units feeds is decided later.
  it('names no space, so the same account can go on to feed several', async () => {
    const { callsFor } = database({
      'connections-begin': [{ data: { authorize_url: AUTHORIZE_URL } }],
    });

    await startConnection('slack');

    const [call] = callsFor('connections-begin');
    expect(call[2]).not.toHaveProperty('space_id');
  });

  it('refuses a request that names no source', async () => {
    const { callsFor } = database({});

    const state = await startConnection('');

    expect(state).toEqual({ status: 'error', message: 'Choose a source.' });
    expect(callsFor('connections-begin')).toEqual([]);
  });

  it('refuses a source name longer than any slug this app knows', async () => {
    const { callsFor } = database({});

    const state = await startConnection('s'.repeat(65));

    expect(state.status).toBe('error');
    expect(callsFor('connections-begin')).toEqual([]);
  });

  it('reports what the edge function refused and sends the browser nowhere', async () => {
    database({ 'connections-begin': [{ error: { message: 'slack is not configured' } }] });

    const state = await startConnection('slack');

    expect(state.status).toBe('error');
    expect(caller.sentTo).toEqual([]);
    expect(caller.revalidated).toEqual([]);
  });

  it('refuses a caller with no session', async () => {
    caller.signedIn = false;

    expect((await startConnection('slack')).status).toBe('error');
    expect(caller.sentTo).toEqual([]);
  });
});

describe('claiming the token the callback parked', () => {
  it('commits the ticket under the session of the person who is signed in', async () => {
    const { callsFor } = database({
      'connections-claim': [{ data: { connection_id: CONNECTION_ID } }],
    });

    const state = await claimPendingConnection('ticket-abc');

    expect(state).toEqual({ status: 'success', data: undefined });
    expect(callsFor('connections-claim')).toEqual([
      ['invoke', 'connections-claim', { ticket: 'ticket-abc' }],
    ]);
    expect(caller.revalidated).toEqual(['/connections']);
  });

  it('refuses a request that carries no ticket', async () => {
    const { callsFor } = database({});

    const state = await claimPendingConnection('');

    expect(state).toEqual({ status: 'error', message: 'That connection ticket is not valid.' });
    expect(callsFor('connections-claim')).toEqual([]);
  });

  it('refuses a ticket longer than any this app issues', async () => {
    const { callsFor } = database({});

    const state = await claimPendingConnection('t'.repeat(257));

    expect(state.status).toBe('error');
    expect(callsFor('connections-claim')).toEqual([]);
  });

  it('reports a ticket the function would not honour', async () => {
    database({ 'connections-claim': [{ error: { message: 'that ticket has expired' } }] });

    const state = await claimPendingConnection('ticket-abc');

    expect(state.status).toBe('error');
    if (state.status === 'error') expect(state.message).toContain('that ticket has expired');
  });
});

describe('choosing where a connection sends each unit', () => {
  it('answers with the routing as it now stands, not with what was sent', async () => {
    const { callsFor } = database({
      'connections-scopes': [{ data: { scope_selection: getScope({ C1: SPACE_ID }) } }],
    });

    const state = await saveScopeSelection(CONNECTION_ID, { C1: SPACE_ID, C9: SPACE_ID });

    expect(state).toEqual({
      status: 'success',
      data: {
        kind: 'set',
        selectionKind: 'channel',
        available: [
          { id: 'C1', name: 'general' },
          { id: 'C2', name: 'engineering' },
        ],
        routes: { C1: SPACE_ID },
      },
    });
    expect(callsFor('connections-scopes')).toEqual([
      [
        'invoke',
        'connections-scopes',
        { connection_id: CONNECTION_ID, routes: { C1: SPACE_ID, C9: SPACE_ID } },
      ],
    ]);
  });

  it('sends one channel to one space and another to a second, from the one account', async () => {
    const { callsFor } = database({
      'connections-scopes': [
        { data: { scope_selection: getScope({ C1: SPACE_ID, C2: FINANCE_ID }) } },
      ],
    });

    const state = await saveScopeSelection(CONNECTION_ID, { C1: SPACE_ID, C2: FINANCE_ID });

    expect(state).toEqual({
      status: 'success',
      data: expect.objectContaining({ routes: { C1: SPACE_ID, C2: FINANCE_ID } }),
    });
    expect(callsFor('connections-scopes')).toEqual([
      [
        'invoke',
        'connections-scopes',
        { connection_id: CONNECTION_ID, routes: { C1: SPACE_ID, C2: FINANCE_ID } },
      ],
    ]);
  });

  it('saves an empty routing, which means the account is read by nobody', async () => {
    const { callsFor } = database({
      'connections-scopes': [{ data: { scope_selection: getScope({}) } }],
    });

    const state = await saveScopeSelection(CONNECTION_ID, {});

    expect(state.status).toBe('success');
    expect(callsFor('connections-scopes')).toContainEqual([
      'invoke',
      'connections-scopes',
      { connection_id: CONNECTION_ID, routes: {} },
    ]);
  });

  it('refuses a connection id that is not a connection', async () => {
    const { callsFor } = database({});

    const state = await saveScopeSelection('slack', { C1: SPACE_ID });

    expect(state).toEqual({ status: 'error', message: 'That routing could not be saved.' });
    expect(callsFor('connections-scopes')).toEqual([]);
  });

  // The destination decides who can read what the unit imports, so it has to be a real space id.
  it('refuses a route that points at something other than a space, before it reaches the edge', async () => {
    const { callsFor } = database({});

    const state = await saveScopeSelection(CONNECTION_ID, { C1: 'engineering' });

    expect(state).toEqual({ status: 'error', message: 'That routing could not be saved.' });
    expect(callsFor('connections-scopes')).toEqual([]);
  });

  it('refuses a unit id longer than any provider issues', async () => {
    const { callsFor } = database({});

    const state = await saveScopeSelection(CONNECTION_ID, { ['C'.repeat(257)]: SPACE_ID });

    expect(state.status).toBe('error');
    expect(callsFor('connections-scopes')).toEqual([]);
  });

  it('refuses a routing longer than any picker offers', async () => {
    const { callsFor } = database({});

    const state = await saveScopeSelection(
      CONNECTION_ID,
      Object.fromEntries(Array.from({ length: 501 }, (_unused, index) => [`C${index}`, SPACE_ID])),
    );

    expect(state.status).toBe('error');
    expect(callsFor('connections-scopes')).toEqual([]);
  });

  it('reports a save the function refused', async () => {
    database({ 'connections-scopes': [{ error: { message: 'connection_expired' } }] });

    expect((await saveScopeSelection(CONNECTION_ID, { C1: SPACE_ID })).status).toBe('error');
  });

  it('refuses a routing the app cannot read back, rather than showing a tick that did not save', async () => {
    database({ 'connections-scopes': [{ data: { scope_selection: 'everything' } }] });

    expect((await saveScopeSelection(CONNECTION_ID, { C1: SPACE_ID })).status).toBe('error');
  });
});

describe('disconnecting a source', () => {
  it('deletes the one connection it was given', async () => {
    const { callsFor } = database({ connections: [{ data: null }] });

    const state = await disconnectConnection(CONNECTION_ID);

    expect(state).toEqual({ status: 'success', data: undefined });
    expect(callsFor('connections')).toEqual([
      ['from', 'connections'],
      ['delete'],
      ['eq', 'id', CONNECTION_ID],
    ]);
    expect(caller.revalidated).toEqual(['/connections']);
  });

  it('refuses an id that is not a connection', async () => {
    const { callsFor } = database({});

    const state = await disconnectConnection('slack');

    expect(state).toEqual({ status: 'error', message: 'That is not a connection.' });
    expect(callsFor('connections')).toEqual([]);
  });

  it('reports a delete the database refused', async () => {
    database({ connections: [{ error: { message: 'permission denied' } }] });

    expect(await disconnectConnection(CONNECTION_ID)).toEqual({
      status: 'error',
      message: 'That connection could not be disconnected.',
    });
  });
});

describe('asking for a full re-sync', () => {
  it('re-reads the source from the beginning, only when a person asks', async () => {
    const { callsFor } = database({
      'connections-sync': [{ data: { outcome: 'synced', job_count: 12, detail: null } }],
    });

    const state = await resyncConnection(CONNECTION_ID);

    expect(state).toEqual({ status: 'success', data: undefined });
    expect(callsFor('connections-sync')).toEqual([
      ['invoke', 'connections-sync', { connection_id: CONNECTION_ID, full: true }],
    ]);
  });

  it('refuses an id that is not a connection', async () => {
    const { callsFor } = database({});

    const state = await resyncConnection('slack');

    expect(state).toEqual({ status: 'error', message: 'That is not a connection.' });
    expect(callsFor('connections-sync')).toEqual([]);
  });

  it('reports a sync that ran but did not finish, with the reason the source gave', async () => {
    database({
      'connections-sync': [
        {
          data: {
            outcome: 'expired',
            job_count: 0,
            detail: 'The Slack token expired and could not be renewed.',
          },
        },
      ],
    });

    const state = await resyncConnection(CONNECTION_ID);

    expect(state).toEqual({
      status: 'error',
      message: 'The Slack token expired and could not be renewed.',
    });
    expect(caller.revalidated).toEqual([]);
  });
});
