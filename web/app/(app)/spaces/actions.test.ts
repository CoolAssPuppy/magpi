import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NOT_SIGNED_IN, type ActionState } from '@/lib/actions/state';
import type { SessionContext } from '@/lib/supabase/context';

const SPACE_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '77777777-7777-4777-8777-777777777777';
const OTHER_USER_ID = '88888888-8888-4888-8888-888888888888';
const ORG_ID = '11111111-1111-4111-8111-111111111111';

type Match = readonly (readonly [string, unknown])[];
type Write = {
  table: string;
  operation: 'insert' | 'update' | 'delete';
  values?: Record<string, unknown>;
  match?: Match;
};
type DbError = { message: string; code?: string } | null;

const dbState = {
  writes: [] as Write[],
  /** Keyed `table:operation`, so a failing join reads differently to a failing insert. */
  failures: {} as Record<string, string>,
  /** Keyed the same way. Only the codes a caller writes copy for need setting. */
  failureCodes: {} as Record<string, string>,
  signedIn: true,
  revalidated: [] as string[],
};

const failureFor = (table: string, operation: string): DbError => {
  const key = `${table}:${operation}`;
  const message = dbState.failures[key];
  return message ? { message, code: dbState.failureCodes[key] } : null;
};

function fakeSupabase() {
  return {
    from: (table: string) => ({
      insert: (values: Record<string, unknown>) => {
        dbState.writes.push({ table, operation: 'insert', values });
        const error = failureFor(table, 'insert');
        return {
          select: () => ({
            single: async () => ({ data: { id: SPACE_ID }, error }),
          }),
          then: (resolve: (value: { error: DbError }) => unknown) =>
            Promise.resolve({ error }).then(resolve),
        };
      },

      update: (values: Record<string, unknown>) => ({
        eq: async (column: string, value: unknown) => {
          dbState.writes.push({ table, operation: 'update', values, match: [[column, value]] });
          return { error: failureFor(table, 'update') };
        },
      }),

      delete: () => {
        const match: (readonly [string, unknown])[] = [];
        const chain = {
          eq: (column: string, value: unknown) => {
            match.push([column, value]);
            return chain;
          },
          then: (resolve: (value: { error: DbError }) => unknown) => {
            dbState.writes.push({ table, operation: 'delete', match: [...match] });
            return Promise.resolve({ error: failureFor(table, 'delete') }).then(resolve);
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
    if (!dbState.signedIn) return { status: 'error', message: NOT_SIGNED_IN };

    const result = await run({
      userId: USER_ID,
      email: 'reader@example.com',
      orgId: ORG_ID,
      role: 'member',
      supabase: fakeSupabase(),
    } as unknown as SessionContext);

    if (result.status === 'success') dbState.revalidated.push(revalidate);
    return result;
  },
}));

const { addSpaceMember, createTeamSpace, removeSpaceMember, setDreaming } =
  await import('./actions');

const form = (fields: Record<string, string>): FormData => {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
};

beforeEach(() => {
  dbState.writes = [];
  dbState.failures = {};
  dbState.failureCodes = {};
  dbState.signedIn = true;
  dbState.revalidated = [];
});

describe('creating a team space', () => {
  it('puts the space in the caller organization and the caller in the space', async () => {
    const state = await createTeamSpace(form({ name: 'Growth' }));

    expect(state).toEqual({ status: 'success', data: { id: SPACE_ID } });
    expect(dbState.writes).toEqual([
      {
        table: 'spaces',
        operation: 'insert',
        values: { org_id: ORG_ID, kind: 'team', name: 'Growth' },
      },
      {
        table: 'space_members',
        operation: 'insert',
        values: { space_id: SPACE_ID, user_id: USER_ID },
      },
    ]);
    expect(dbState.revalidated).toEqual(['/spaces']);
  });

  it('drops the whitespace around a name so no space is called a blank', async () => {
    await createTeamSpace(form({ name: '   Growth   ' }));

    expect(dbState.writes[0].values).toMatchObject({ name: 'Growth' });
  });

  it('says a space needs a name, and creates nothing', async () => {
    const state = await createTeamSpace(form({ name: '   ' }));

    expect(state).toEqual({ status: 'error', message: 'A space needs a name.' });
    expect(dbState.writes).toEqual([]);
  });

  it('refuses a name longer than a space name is allowed to be', async () => {
    const state = await createTeamSpace(form({ name: 'g'.repeat(121) }));

    expect(state.status).toBe('error');
    expect(dbState.writes).toEqual([]);
  });

  it('answers in terms the reader can act on rather than with an id nobody can use', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    dbState.failures['spaces:insert'] = 'new row violates row-level security';

    const state = await createTeamSpace(form({ name: 'Growth' }));

    expect(state).toEqual({ status: 'error', message: 'That space could not be created.' });
    expect(dbState.writes.map((write) => write.table)).toEqual(['spaces']);
    expect(dbState.revalidated).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  // The space exists but its author cannot see it, so the copy says that.
  it('reports a space whose author could not be joined to it, rather than claiming success', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    dbState.failures['space_members:insert'] = 'duplicate key value';

    const state = await createTeamSpace(form({ name: 'Growth' }));

    expect(state).toEqual({
      status: 'error',
      message: 'The space was created but you were not added to it.',
    });
    expect(dbState.revalidated).toEqual([]);
    consoleError.mockRestore();
  });

  it('turns away a caller with no session', async () => {
    dbState.signedIn = false;

    const state = await createTeamSpace(form({ name: 'Growth' }));

    expect(state).toEqual({ status: 'error', message: NOT_SIGNED_IN });
    expect(dbState.writes).toEqual([]);
  });
});

describe('adding someone to a space', () => {
  it('joins the named person to the named space', async () => {
    const state = await addSpaceMember(form({ spaceId: SPACE_ID, userId: OTHER_USER_ID }));

    expect(state).toEqual({ status: 'success', data: undefined });
    expect(dbState.writes).toEqual([
      {
        table: 'space_members',
        operation: 'insert',
        values: { space_id: SPACE_ID, user_id: OTHER_USER_ID },
      },
    ]);
    expect(dbState.revalidated).toEqual(['/spaces']);
  });

  it('refuses an id that is not a person, without echoing it back', async () => {
    const state = await addSpaceMember(form({ spaceId: SPACE_ID, userId: 'nobody' }));

    expect(state).toEqual({ status: 'error', message: 'That member could not be added.' });
    expect(dbState.writes).toEqual([]);
  });

  it('refuses an id that is not a space', async () => {
    const state = await addSpaceMember(form({ spaceId: 'nowhere', userId: OTHER_USER_ID }));

    expect(state.status).toBe('error');
    expect(dbState.writes).toEqual([]);
  });

  it('reports a refusal from row level security rather than a join that did not happen', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    dbState.failures['space_members:insert'] = 'new row violates row-level security';

    const state = await addSpaceMember(form({ spaceId: SPACE_ID, userId: OTHER_USER_ID }));

    expect(state).toEqual({ status: 'error', message: 'That member could not be added.' });
    expect(dbState.revalidated).toEqual([]);
    consoleError.mockRestore();
  });

  // A unique violation is the one refusal here the reader can act on.
  it('says they are already in the space rather than that adding them failed', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    dbState.failures['space_members:insert'] = 'duplicate key value violates unique constraint';
    dbState.failureCodes['space_members:insert'] = '23505';

    const state = await addSpaceMember(form({ spaceId: SPACE_ID, userId: OTHER_USER_ID }));

    expect(state).toEqual({ status: 'error', message: 'They are already in this space.' });
    consoleError.mockRestore();
  });
});

describe('taking someone out of a space', () => {
  it('removes that one person from that one space', async () => {
    const state = await removeSpaceMember(form({ spaceId: SPACE_ID, userId: OTHER_USER_ID }));

    expect(state).toEqual({ status: 'success', data: undefined });
    expect(dbState.writes).toEqual([
      {
        table: 'space_members',
        operation: 'delete',
        match: [
          ['space_id', SPACE_ID],
          ['user_id', OTHER_USER_ID],
        ],
      },
    ]);
    expect(dbState.revalidated).toEqual(['/spaces']);
  });

  it('refuses an id that is not a person', async () => {
    const state = await removeSpaceMember(form({ spaceId: SPACE_ID, userId: 'nobody' }));

    expect(state).toEqual({ status: 'error', message: 'That member could not be removed.' });
    expect(dbState.writes).toEqual([]);
  });

  it('reports a refusal from row level security rather than a removal that did not happen', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    dbState.failures['space_members:delete'] = 'permission denied for table space_members';

    const state = await removeSpaceMember(form({ spaceId: SPACE_ID, userId: OTHER_USER_ID }));

    expect(state).toEqual({ status: 'error', message: 'That member could not be removed.' });
    expect(dbState.revalidated).toEqual([]);
    consoleError.mockRestore();
  });
});

describe('dreaming over a space', () => {
  it('turns dreaming on for the space that was named', async () => {
    const state = await setDreaming(form({ spaceId: SPACE_ID, enabled: 'true' }));

    expect(state).toEqual({ status: 'success', data: undefined });
    expect(dbState.writes).toEqual([
      {
        table: 'spaces',
        operation: 'update',
        values: { dreaming_enabled: true },
        match: [['id', SPACE_ID]],
      },
    ]);
    expect(dbState.revalidated).toEqual(['/spaces']);
  });

  it('turns dreaming off again', async () => {
    await setDreaming(form({ spaceId: SPACE_ID, enabled: 'false' }));

    expect(dbState.writes[0].values).toEqual({ dreaming_enabled: false });
  });

  it('leaves dreaming off when the form said something other than true', async () => {
    await setDreaming(form({ spaceId: SPACE_ID, enabled: 'on' }));

    expect(dbState.writes[0].values).toEqual({ dreaming_enabled: false });
  });

  it('refuses an id that is not a space, and changes nothing', async () => {
    const state = await setDreaming(form({ spaceId: 'nowhere', enabled: 'true' }));

    expect(state).toEqual({ status: 'error', message: 'That setting could not be changed.' });
    expect(dbState.writes).toEqual([]);
  });

  it('reports a refusal without repeating what the database said', async () => {
    dbState.failures['spaces:update'] = 'permission denied for table spaces';

    const state = await setDreaming(form({ spaceId: SPACE_ID, enabled: 'true' }));

    // The raw message names a table and a privilege, so both surfaces answer the same way.
    expect(state).toEqual({
      status: 'error',
      message: 'Dreaming could not be changed for that space.',
    });
    expect(dbState.revalidated).toEqual([]);
  });
});
