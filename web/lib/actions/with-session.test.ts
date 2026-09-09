import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/lib/database.types';
import type { SessionContext } from '@/lib/supabase/context';

import { errorState, NOT_SIGNED_IN, successState } from './state';

vi.mock('server-only', () => ({}));

const session = { current: null as SessionContext | null };
const revalidated: string[] = [];

vi.mock('@/lib/supabase/context', () => ({
  getSessionContext: async () => session.current,
}));

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path);
  },
}));

const { withSession } = await import('./with-session');

/** The cast is confined here: the wrapper carries the client through untouched. */
const noClient = {} as unknown as SupabaseClient<Database>;

const getSession = (overrides: Partial<SessionContext> = {}): SessionContext => ({
  userId: '77777777-7777-4777-8777-777777777777',
  email: 'reader@example.com',
  orgId: '11111111-1111-4111-8111-111111111111',
  role: 'member',
  supabase: noClient,
  ...overrides,
});

beforeEach(() => {
  session.current = getSession();
  revalidated.length = 0;
});

describe('running an action as the signed-in caller', () => {
  it('hands the action the caller and the organization they are acting in', async () => {
    session.current = getSession({ orgId: 'org-of-record' });
    const seen: string[] = [];

    await withSession(async ({ orgId, userId }) => {
      seen.push(orgId, userId);
      return successState(undefined);
    }, '/spaces');

    expect(seen).toEqual(['org-of-record', '77777777-7777-4777-8777-777777777777']);
  });

  it('answers a signed-out caller without running the action at all', async () => {
    session.current = null;
    const run = vi.fn();

    const state = await withSession(async () => {
      run();
      return successState(undefined);
    }, '/spaces');

    expect(state).toEqual({ status: 'error', message: NOT_SIGNED_IN });
    expect(run).not.toHaveBeenCalled();
  });

  it('returns whatever the action decided, untouched', async () => {
    const state = await withSession(async () => successState({ id: 'space-1' }), '/spaces');

    expect(state).toEqual({ status: 'success', data: { id: 'space-1' } });
  });
});

describe('refreshing the page the write changed', () => {
  it('rebuilds the page once the write went through', async () => {
    await withSession(async () => successState(undefined), '/spaces');

    expect(revalidated).toEqual(['/spaces']);
  });

  it('leaves the page as it was when the write failed, so nothing looks saved', async () => {
    await withSession(async () => errorState('new row violates row-level security'), '/spaces');

    expect(revalidated).toEqual([]);
  });

  it('rebuilds nothing for a caller it turned away', async () => {
    session.current = null;

    await withSession(async () => successState(undefined), '/spaces');

    expect(revalidated).toEqual([]);
  });
});

describe('an action that unwinds by throwing', () => {
  it('lets a redirect through instead of stalling the form that raised it', async () => {
    const redirect = new Error('NEXT_REDIRECT');

    await expect(
      withSession(async () => {
        throw redirect;
      }, '/spaces'),
    ).rejects.toBe(redirect);

    expect(revalidated).toEqual([]);
  });
});
