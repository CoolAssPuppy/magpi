import { beforeEach, describe, expect, it, vi } from 'vitest';

import { idleState, type ActionState } from '@/lib/actions/state';
import type { SessionContext } from '@/lib/supabase/context';

const USER_ID = '77777777-7777-4777-8777-777777777777';
const ORG_ID = '55555555-5555-4555-8555-555555555555';

type Write = {
  table: string;
  operation: string;
  values?: unknown;
  match?: readonly (readonly [string, unknown])[];
};

const account = {
  writes: [] as Write[],
  error: null as { message: string } | null,
  signedIn: true,
  revalidated: [] as string[],
  redirects: [] as string[],
};

vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    account.redirects.push(path);
    throw new Error('NEXT_REDIRECT');
  },
}));

function fakeSupabase() {
  return {
    auth: {
      updateUser: async (values: unknown) => {
        account.writes.push({ table: 'auth.users', operation: 'update', values });
        return { error: account.error };
      },
      signOut: async (options: unknown) => {
        account.writes.push({ table: 'auth.sessions', operation: 'delete', values: options });
        return { error: account.error };
      },
    },
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => {
        const match: (readonly [string, unknown])[] = [];
        const chain = {
          eq: (column: string, value: unknown) => {
            match.push([column, value]);
            return chain;
          },
          then: (resolve: (settled: { error: { message: string } | null }) => unknown) => {
            account.writes.push({ table, operation: 'update', values, match });
            return Promise.resolve({ error: account.error }).then(resolve);
          },
        };
        return chain;
      },
    }),
  };
}

vi.mock('@/lib/actions/with-session', () => ({
  withSession: async <T>(
    run: (context: SessionContext) => Promise<ActionState<T>>,
    revalidate: string,
  ): Promise<ActionState<T>> => {
    if (!account.signedIn) return { status: 'error', message: 'You need to sign in to do that.' };

    const result = await run({
      userId: USER_ID,
      email: 'reader@example.com',
      orgId: ORG_ID,
      role: 'member',
      supabase: fakeSupabase(),
    } as unknown as SessionContext);

    if (result.status === 'success') account.revalidated.push(revalidate);
    return result;
  },
}));

const { renamePersonalSpace, signOutEverywhere, updateDisplayName } = await import('./actions');

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

beforeEach(() => {
  account.writes = [];
  account.error = null;
  account.signedIn = true;
  account.revalidated = [];
  account.redirects = [];
});

describe('changing a display name', () => {
  it('saves the name onto the account', async () => {
    const state = await updateDisplayName(idleState, form({ displayName: 'Ada Lovelace' }));

    expect(state).toEqual({ status: 'success', data: undefined });
    expect(account.writes).toEqual([
      {
        table: 'auth.users',
        operation: 'update',
        values: { data: { display_name: 'Ada Lovelace' } },
      },
    ]);
  });

  it('shows the new name on the settings page straight away', async () => {
    await updateDisplayName(idleState, form({ displayName: 'Ada Lovelace' }));

    expect(account.revalidated).toEqual(['/settings']);
  });

  it('drops the spaces somebody typed around the name', async () => {
    await updateDisplayName(idleState, form({ displayName: '  Ada Lovelace  ' }));

    expect(account.writes[0].values).toEqual({ data: { display_name: 'Ada Lovelace' } });
  });

  it('refuses a name that is only whitespace, and changes nothing', async () => {
    const state = await updateDisplayName(idleState, form({ displayName: '   ' }));

    expect(state).toEqual({
      status: 'error',
      message: 'A display name is between 1 and 80 characters.',
    });
    expect(account.writes).toEqual([]);
  });

  it('refuses a name longer than 80 characters', async () => {
    const state = await updateDisplayName(idleState, form({ displayName: 'a'.repeat(81) }));

    expect(state.status).toBe('error');
    expect(account.writes).toEqual([]);
  });

  it('says the save failed rather than pretending it worked', async () => {
    account.error = { message: 'auth service unavailable' };

    const state = await updateDisplayName(idleState, form({ displayName: 'Ada Lovelace' }));

    expect(state).toEqual({ status: 'error', message: 'Your display name could not be saved.' });
    expect(account.revalidated).toEqual([]);
  });

  it('refuses a caller with no session', async () => {
    account.signedIn = false;

    const state = await updateDisplayName(idleState, form({ displayName: 'Ada Lovelace' }));

    expect(state).toEqual({ status: 'error', message: 'You need to sign in to do that.' });
  });
});

describe('renaming a personal space', () => {
  it('renames the space belonging to the caller, in their organization', async () => {
    const state = await renamePersonalSpace(idleState, form({ name: 'Reading pile' }));

    expect(state).toEqual({ status: 'success', data: undefined });
    expect(account.writes).toEqual([
      {
        table: 'spaces',
        operation: 'update',
        values: { name: 'Reading pile' },
        match: [
          ['org_id', ORG_ID],
          ['kind', 'personal'],
          ['owner_user_id', USER_ID],
        ],
      },
    ]);
  });

  it('refuses an empty space name, and changes nothing', async () => {
    const state = await renamePersonalSpace(idleState, form({ name: '  ' }));

    expect(state).toEqual({
      status: 'error',
      message: 'A space name is between 1 and 120 characters.',
    });
    expect(account.writes).toEqual([]);
  });

  it('refuses a space name longer than 120 characters', async () => {
    const state = await renamePersonalSpace(idleState, form({ name: 'a'.repeat(121) }));

    expect(state.status).toBe('error');
    expect(account.writes).toEqual([]);
  });

  it('says the rename failed rather than pretending it worked', async () => {
    account.error = { message: 'new row violates row-level security' };

    const state = await renamePersonalSpace(idleState, form({ name: 'Reading pile' }));

    expect(state).toEqual({ status: 'error', message: 'That space could not be renamed.' });
    expect(account.revalidated).toEqual([]);
  });
});

describe('signing out everywhere', () => {
  it('revokes every session this account holds, not just this browser', async () => {
    await expect(signOutEverywhere(idleState, form({}))).rejects.toThrow('NEXT_REDIRECT');

    expect(account.writes).toEqual([
      { table: 'auth.sessions', operation: 'delete', values: { scope: 'global' } },
    ]);
  });

  it('lands the person back on the sign-in page', async () => {
    await expect(signOutEverywhere(idleState, form({}))).rejects.toThrow('NEXT_REDIRECT');

    expect(account.redirects).toEqual(['/sign-in']);
  });

  it('says so when the sign-out failed, and keeps the person where they are', async () => {
    account.error = { message: 'auth service unavailable' };

    const state = await signOutEverywhere(idleState, form({}));

    expect(state).toEqual({ status: 'error', message: 'You could not be signed out. Try again.' });
    expect(account.redirects).toEqual([]);
  });
});
