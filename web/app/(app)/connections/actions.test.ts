import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionState } from '@/lib/actions/state';
import type { SessionContext } from '@/lib/supabase/context';
import {
  recordingContext,
  type RecordingContext,
  type StubResponse,
} from '@/lib/supabase/test-support';

const SPACE_ID = '33333333-3333-4333-8333-333333333333';
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

const visibleSpace = { data: { id: SPACE_ID } };

const populatedScope = {
  kind: 'channel',
  available: [
    { id: 'C1', name: 'general' },
    { id: 'C2', name: 'engineering' },
  ],
  selected: ['C1'],
};

beforeEach(() => {
  caller.signedIn = true;
  caller.database = null;
  caller.revalidated = [];
  caller.sentTo = [];
});

describe('connecting a source to a space', () => {
  it('sends the person to the provider, and asks to be returned to the connections list', async () => {
    const { callsFor } = database({
      spaces: [visibleSpace],
      'connections-begin': [{ data: { authorize_url: AUTHORIZE_URL } }],
    });

    const state = await startConnection('slack', SPACE_ID);

    expect(state).toEqual({ status: 'success', data: undefined });
    expect(caller.sentTo).toEqual([AUTHORIZE_URL]);
    expect(callsFor('connections-begin')).toEqual([
      [
        'invoke',
        'connections-begin',
        { provider: 'slack', space_id: SPACE_ID, return_to: '/connections?provider=slack' },
      ],
    ]);
  });

  it('refuses a space the caller cannot select, before asking for an authorize url', async () => {
    const { callsFor } = database({ spaces: [{ data: null }] });

    const state = await startConnection('slack', SPACE_ID);

    expect(state).toEqual({
      status: 'error',
      message: 'You are not in that space.',
    });
    expect(callsFor('connections-begin')).toEqual([]);
    expect(caller.sentTo).toEqual([]);
  });

  it('refuses a space id that is not a space', async () => {
    const { callsFor } = database({});

    const state = await startConnection('slack', 'engineering');

    expect(state.status).toBe('error');
    expect(callsFor('spaces')).toEqual([]);
  });

  it('refuses a request that names no source', async () => {
    const { callsFor } = database({});

    const state = await startConnection('', SPACE_ID);

    expect(state.status).toBe('error');
    expect(callsFor('spaces')).toEqual([]);
  });

  it('reports what the edge function refused and sends the browser nowhere', async () => {
    database({
      spaces: [visibleSpace],
      'connections-begin': [{ error: { message: 'slack is not configured' } }],
    });

    const state = await startConnection('slack', SPACE_ID);

    expect(state.status).toBe('error');
    expect(caller.sentTo).toEqual([]);
    expect(caller.revalidated).toEqual([]);
  });

  it('refuses a caller with no session', async () => {
    caller.signedIn = false;

    expect((await startConnection('slack', SPACE_ID)).status).toBe('error');
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

describe('choosing what a connection reads', () => {
  it('answers with the selection as it now stands, not with what was sent', async () => {
    const { callsFor } = database({
      'connections-scopes': [{ data: { scope_selection: populatedScope } }],
    });

    const state = await saveScopeSelection(CONNECTION_ID, ['C1', 'C9']);

    expect(state).toEqual({
      status: 'success',
      data: {
        kind: 'set',
        selectionKind: 'channel',
        available: [
          { id: 'C1', name: 'general' },
          { id: 'C2', name: 'engineering' },
        ],
        selected: ['C1'],
      },
    });
    expect(callsFor('connections-scopes')).toEqual([
      ['invoke', 'connections-scopes', { connection_id: CONNECTION_ID, selected: ['C1', 'C9'] }],
    ]);
  });

  it('saves an empty choice, which for a channel source means reading nothing', async () => {
    const { callsFor } = database({
      'connections-scopes': [{ data: { scope_selection: { ...populatedScope, selected: [] } } }],
    });

    const state = await saveScopeSelection(CONNECTION_ID, []);

    expect(state.status).toBe('success');
    expect(callsFor('connections-scopes')).toContainEqual([
      'invoke',
      'connections-scopes',
      { connection_id: CONNECTION_ID, selected: [] },
    ]);
  });

  it('refuses a connection id that is not a connection', async () => {
    const { callsFor } = database({});

    const state = await saveScopeSelection('slack', ['C1']);

    expect(state).toEqual({
      status: 'error',
      message: 'That selection could not be saved.',
    });
    expect(callsFor('connections-scopes')).toEqual([]);
  });

  it('refuses a choice longer than any picker offers', async () => {
    const { callsFor } = database({});

    const state = await saveScopeSelection(
      CONNECTION_ID,
      Array.from({ length: 501 }, (_unused, index) => `C${index}`),
    );

    expect(state.status).toBe('error');
    expect(callsFor('connections-scopes')).toEqual([]);
  });

  it('reports a save the function refused', async () => {
    database({ 'connections-scopes': [{ error: { message: 'connection_expired' } }] });

    expect((await saveScopeSelection(CONNECTION_ID, ['C1'])).status).toBe('error');
  });

  it('refuses a selection the app cannot read back, rather than showing a tick that did not save', async () => {
    database({ 'connections-scopes': [{ data: { scope_selection: 'everything' } }] });

    expect((await saveScopeSelection(CONNECTION_ID, ['C1'])).status).toBe('error');
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
