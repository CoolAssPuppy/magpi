import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionState } from '@/lib/actions/state';
import type { SessionContext } from '@/lib/supabase/context';

const USER_ID = '77777777-7777-4777-8777-777777777777';
const ORG_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const INVITE_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-09-09T14:20:00.000Z');

type Write = {
  readonly table: string;
  readonly operation: 'insert' | 'delete';
  readonly values?: Record<string, unknown>;
  readonly match?: ReadonlyArray<readonly [string, unknown]>;
};

const dbState = {
  writes: [] as Write[],
  error: null as { readonly message: string; readonly code?: string } | null,
  signedIn: true,
  revalidated: [] as string[],
};

function fakeSupabase() {
  return {
    from: (table: string) => ({
      insert: (values: Record<string, unknown>) => {
        dbState.writes.push({ table, operation: 'insert', values });
        return Promise.resolve({ error: dbState.error });
      },

      delete: () => {
        const match: Array<readonly [string, unknown]> = [];
        dbState.writes.push({ table, operation: 'delete', match });

        const builder = {
          eq: (column: string, value: unknown) => {
            match.push([column, value]);
            return builder;
          },
          then: (resolve: (value: { error: unknown }) => unknown) =>
            Promise.resolve({ error: dbState.error }).then(resolve),
        };

        return builder;
      },
    }),
  };
}

vi.mock('@/lib/actions/with-session', () => ({
  withSession: async <T>(
    run: (context: SessionContext) => Promise<ActionState<T>>,
    revalidate: string,
  ): Promise<ActionState<T>> => {
    if (!dbState.signedIn) return { status: 'error', message: 'You need to sign in to do that.' };

    const result = await run({
      userId: USER_ID,
      email: 'ada@example.com',
      orgId: ORG_ID,
      role: 'admin',
      supabase: fakeSupabase(),
    } as unknown as SessionContext);

    if (result.status === 'success') dbState.revalidated.push(revalidate);
    return result;
  },
}));

const { inviteMember, removeMember, revokeInvite } = await import('./actions');

function inviteForm(overrides: Partial<Record<'email' | 'role', string>> = {}): FormData {
  const fields = { email: 'grace@example.com', role: 'member', ...overrides };
  const form = new FormData();
  form.set('email', fields.email);
  form.set('role', fields.role);
  return form;
}

function idForm(field: string, id: string): FormData {
  const form = new FormData();
  form.set(field, id);
  return form;
}

const idle: ActionState<never> = { status: 'idle' };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  dbState.writes = [];
  dbState.error = null;
  dbState.signedIn = true;
  dbState.revalidated = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('inviting someone into the organization', () => {
  it('creates the invitation and shows the admin the link to send on', async () => {
    const state = await inviteMember(idle, inviteForm());

    expect(state.status).toBe('success');
    if (state.status !== 'success') return;
    expect(state.data.email).toBe('grace@example.com');
    expect(state.data.token).not.toBe('');
    expect(dbState.revalidated).toEqual(['/admin/members']);
  });

  it('stores only a hash, so reading the table cannot be turned into an accepted invitation', async () => {
    const state = await inviteMember(idle, inviteForm());

    expect(state.status).toBe('success');
    if (state.status !== 'success') return;

    const values = dbState.writes[0].values ?? {};
    expect(values.token_hash).toBe(createHash('sha256').update(state.data.token).digest('hex'));
    expect(Object.values(values)).not.toContain(state.data.token);
  });

  it('records the organization, the role asked for and who did the inviting', async () => {
    await inviteMember(idle, inviteForm({ role: 'admin' }));

    expect(dbState.writes[0]).toMatchObject({
      table: 'org_invites',
      operation: 'insert',
      values: {
        org_id: ORG_ID,
        email: 'grace@example.com',
        role: 'admin',
        invited_by: USER_ID,
      },
    });
  });

  it('expires the link a week out, so a leaked invitation stops working', async () => {
    await inviteMember(idle, inviteForm());

    expect(dbState.writes[0].values?.expires_at).toBe('2026-09-16T14:20:00.000Z');
  });

  it('gives every invitation its own token', async () => {
    const first = await inviteMember(idle, inviteForm());
    const second = await inviteMember(idle, inviteForm({ email: 'ada@example.com' }));

    expect(first.status === 'success' && second.status === 'success').toBe(true);
    if (first.status !== 'success' || second.status !== 'success') return;
    expect(first.data.token).not.toBe(second.data.token);
  });

  it('refuses an address that is not an address, without touching the database', async () => {
    const state = await inviteMember(idle, inviteForm({ email: 'grace at example' }));

    expect(state).toEqual({
      status: 'error',
      message: 'Enter a valid email address and pick a role.',
    });
    expect(dbState.writes).toEqual([]);
  });

  it('refuses a role the organization does not have', async () => {
    const state = await inviteMember(idle, inviteForm({ role: 'owner' }));

    expect(state.status).toBe('error');
    expect(dbState.writes).toEqual([]);
  });

  it('says the address already has an invitation waiting when the unique index refuses', async () => {
    dbState.error = { message: 'duplicate key value', code: '23505' };

    const state = await inviteMember(idle, inviteForm());

    expect(state).toEqual({
      status: 'error',
      message: 'That address already has an invitation waiting.',
    });
    expect(dbState.revalidated).toEqual([]);
  });

  it('reports a plain failure for anything else the database refuses', async () => {
    dbState.error = { message: 'new row violates row-level security', code: '42501' };

    const state = await inviteMember(idle, inviteForm());

    expect(state).toEqual({
      status: 'error',
      message: 'The invitation could not be created.',
    });
  });

  it('refuses a caller with no session', async () => {
    dbState.signedIn = false;

    const state = await inviteMember(idle, inviteForm());

    expect(state).toEqual({ status: 'error', message: 'You need to sign in to do that.' });
    expect(dbState.writes).toEqual([]);
  });
});

describe('removing a member', () => {
  it('removes them from the caller own organization and nowhere else', async () => {
    const state = await removeMember(idle, idForm('userId', MEMBER_ID));

    expect(state).toEqual({ status: 'success', data: undefined });
    expect(dbState.writes).toEqual([
      {
        table: 'org_members',
        operation: 'delete',
        match: [
          ['org_id', ORG_ID],
          ['user_id', MEMBER_ID],
        ],
      },
    ]);
    expect(dbState.revalidated).toEqual(['/admin/members']);
  });

  it('refuses an id that is not a member id', async () => {
    const state = await removeMember(idle, idForm('userId', 'not-a-uuid'));

    expect(state).toEqual({ status: 'error', message: 'That member could not be identified.' });
    expect(dbState.writes).toEqual([]);
  });

  it('says the removal failed rather than reporting a success that did not happen', async () => {
    dbState.error = { message: 'permission denied' };

    const state = await removeMember(idle, idForm('userId', MEMBER_ID));

    expect(state).toEqual({ status: 'error', message: 'That member could not be removed.' });
    expect(dbState.revalidated).toEqual([]);
  });

  it('refuses a caller with no session', async () => {
    dbState.signedIn = false;

    const state = await removeMember(idle, idForm('userId', MEMBER_ID));

    expect(state).toEqual({ status: 'error', message: 'You need to sign in to do that.' });
  });
});

describe('revoking an invitation', () => {
  it('deletes the invitation from the caller own organization and nowhere else', async () => {
    const state = await revokeInvite(idle, idForm('inviteId', INVITE_ID));

    expect(state).toEqual({ status: 'success', data: undefined });
    expect(dbState.writes).toEqual([
      {
        table: 'org_invites',
        operation: 'delete',
        match: [
          ['org_id', ORG_ID],
          ['id', INVITE_ID],
        ],
      },
    ]);
    expect(dbState.revalidated).toEqual(['/admin/members']);
  });

  it('refuses an id that is not an invitation id', async () => {
    const state = await revokeInvite(idle, idForm('inviteId', ''));

    expect(state).toEqual({
      status: 'error',
      message: 'That invitation could not be identified.',
    });
    expect(dbState.writes).toEqual([]);
  });

  it('says the revocation failed rather than reporting a success that did not happen', async () => {
    dbState.error = { message: 'permission denied' };

    const state = await revokeInvite(idle, idForm('inviteId', INVITE_ID));

    expect(state).toEqual({ status: 'error', message: 'That invitation could not be revoked.' });
  });

  it('refuses a caller with no session', async () => {
    dbState.signedIn = false;

    const state = await revokeInvite(idle, idForm('inviteId', INVITE_ID));

    expect(state).toEqual({ status: 'error', message: 'You need to sign in to do that.' });
  });
});
