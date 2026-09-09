import { describe, expect, it, vi } from 'vitest';

import { beginConnection, claimConnection, requestFullSync, requestScopes } from './edge';

const getClient = (response: { data?: unknown; error?: { message: string } | null }) => ({
  functions: {
    invoke: vi
      .fn()
      .mockResolvedValue({ data: response.data ?? null, error: response.error ?? null }),
  },
});

describe('starting a connection', () => {
  it('asks the edge function for an authorize url and hands it back', async () => {
    const client = getClient({ data: { authorize_url: 'https://slack.com/oauth?state=abc' } });

    const result = await beginConnection(client, {
      provider: 'slack',
      spaceId: 'space-1',
      returnTo: '/connections/slack',
    });

    expect(result).toEqual({
      ok: true,
      data: { authorizeUrl: 'https://slack.com/oauth?state=abc' },
    });
    expect(client.functions.invoke).toHaveBeenCalledWith('connections-begin', {
      body: { provider: 'slack', space_id: 'space-1', return_to: '/connections/slack' },
    });
  });

  it('reports a transport failure rather than sending the browser nowhere', async () => {
    const client = getClient({ error: { message: 'Function returned 500' } });

    const result = await beginConnection(client, {
      provider: 'slack',
      spaceId: 'space-1',
      returnTo: '/connections/slack',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Function returned 500');
  });

  it('refuses a response that does not carry a url, rather than redirecting to undefined', async () => {
    const client = getClient({ data: { authorize_url: 'not a url' } });

    const result = await beginConnection(client, {
      provider: 'slack',
      spaceId: 'space-1',
      returnTo: '/connections/slack',
    });

    expect(result.ok).toBe(false);
  });
});

describe('claiming a connection after the callback', () => {
  it('sends the ticket and reads back the connection it committed', async () => {
    const client = getClient({ data: { connection_id: '11111111-2222-4333-8444-555555555555' } });

    const result = await claimConnection(client, { ticket: 'ticket-abc' });

    expect(result).toEqual({
      ok: true,
      data: { connectionId: '11111111-2222-4333-8444-555555555555' },
    });
    expect(client.functions.invoke).toHaveBeenCalledWith('connections-claim', {
      body: { ticket: 'ticket-abc' },
    });
  });

  it('reports a ticket the function refused', async () => {
    const client = getClient({ error: { message: 'ticket expired' } });

    const result = await claimConnection(client, { ticket: 'ticket-abc' });

    expect(result.ok).toBe(false);
  });
});

describe('asking for a full re-sync', () => {
  it('is a deliberate call with the full flag set, never a side effect', async () => {
    const client = getClient({
      data: { connection_id: 'conn-1', outcome: 'synced', job_count: 12, detail: null },
    });

    const result = await requestFullSync(client, { connectionId: 'conn-1' });

    expect(result).toEqual({ ok: true, data: { jobCount: 12 } });
    expect(client.functions.invoke).toHaveBeenCalledWith('connections-sync', {
      body: { connection_id: 'conn-1', full: true },
    });
  });

  it('treats a sync the function completed but did not finish as a failure', async () => {
    const client = getClient({
      data: {
        connection_id: 'conn-1',
        outcome: 'expired',
        job_count: 0,
        detail: 'The Slack token expired and could not be renewed.',
      },
    });

    const result = await requestFullSync(client, { connectionId: 'conn-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('The Slack token expired and could not be renewed.');
  });

  it('still says something useful when a failed sync carries no detail', async () => {
    const client = getClient({
      data: { connection_id: 'conn-1', outcome: 'timeout', job_count: 0, detail: null },
    });

    const result = await requestFullSync(client, { connectionId: 'conn-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('timeout');
  });
});

describe('reading and saving what a connection may read', () => {
  const populated = {
    kind: 'channel',
    available: [
      { id: 'C1', name: 'general' },
      { id: 'C2', name: 'engineering' },
    ],
    selected: ['C1'],
  };

  it('saves a selection and hands back the list the provider actually offers now', async () => {
    const client = getClient({ data: { connection_id: 'conn-1', scope_selection: populated } });

    const result = await requestScopes(client, { connectionId: 'conn-1', selected: ['C1'] });

    expect(client.functions.invoke).toHaveBeenCalledWith('connections-scopes', {
      body: { connection_id: 'conn-1', selected: ['C1'] },
    });
    expect(result).toEqual({
      ok: true,
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
  });

  it('refreshes the list without saving anything when no selection is given', async () => {
    const client = getClient({ data: { connection_id: 'conn-1', scope_selection: populated } });

    await requestScopes(client, { connectionId: 'conn-1' });

    expect(client.functions.invoke).toHaveBeenCalledWith('connections-scopes', {
      body: { connection_id: 'conn-1' },
    });
  });

  it('reports a connection whose token could not be renewed', async () => {
    const client = getClient({ error: { message: 'connection_expired' } });

    const result = await requestScopes(client, { connectionId: 'conn-1', selected: [] });

    expect(result.ok).toBe(false);
  });
});
