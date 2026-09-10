import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionState } from '@/lib/actions/state';
import type { SessionContext } from '@/lib/supabase/context';

const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';
const SPACE_ID = '33333333-3333-4333-8333-333333333333';

type Write = { table: string; operation: string; values?: unknown; match?: unknown };

const dbState = {
  writes: [] as Write[],
  error: null as { message: string; code?: string } | null,
  signedIn: true,
  revalidated: [] as string[],
};

function fakeSupabase() {
  const result = () => ({ error: dbState.error });

  return {
    from: (table: string) => ({
      insert: (values: unknown) => {
        dbState.writes.push({ table, operation: 'insert', values });
        return {
          select: () => ({
            single: async () => ({ data: { id: CONVERSATION_ID }, error: dbState.error }),
          }),
        };
      },
      update: (values: unknown) => ({
        eq: async (column: string, value: unknown) => {
          dbState.writes.push({ table, operation: 'update', values, match: [column, value] });
          return result();
        },
      }),
      delete: () => ({
        eq: async (column: string, value: unknown) => {
          dbState.writes.push({ table, operation: 'delete', match: [column, value] });
          return result();
        },
      }),
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
      userId: '77777777-7777-4777-8777-777777777777',
      email: 'reader@example.com',
      orgId: 'org-1',
      role: 'member',
      supabase: fakeSupabase(),
    } as unknown as SessionContext);

    if (result.status === 'success') dbState.revalidated.push(revalidate);
    return result;
  },
}));

const {
  createConversationAction,
  createFolderAction,
  deleteConversationAction,
  deleteFolderAction,
  moveConversationAction,
  renameConversationAction,
  renameFolderAction,
} = await import('./actions');

beforeEach(() => {
  dbState.writes = [];
  dbState.error = null;
  dbState.signedIn = true;
  dbState.revalidated = [];
});

describe('createConversationAction', () => {
  it('opens a conversation for the caller in their organization', async () => {
    const state = await createConversationAction({ spaceFilter: null });

    expect(state).toEqual({ status: 'success', data: CONVERSATION_ID });
    expect(dbState.writes[0]).toEqual({
      table: 'conversations',
      operation: 'insert',
      values: {
        org_id: 'org-1',
        user_id: '77777777-7777-4777-8777-777777777777',
        space_filter: null,
      },
    });
  });

  it('narrows a conversation to the spaces it was opened against', async () => {
    await createConversationAction({ spaceFilter: [SPACE_ID] });

    expect(dbState.writes[0].values).toMatchObject({ space_filter: [SPACE_ID] });
  });

  it('refuses a space that is not a space', async () => {
    const state = await createConversationAction({ spaceFilter: ['not-a-space'] });

    expect(state.status).toBe('error');
    expect(dbState.writes).toEqual([]);
  });

  // The reader gets copy they can act on, not the RLS refusal, which names a table.
  it('answers with copy for the reader rather than the schema refusal', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    dbState.error = { message: 'new row violates row-level security' };

    const state = await createConversationAction({ spaceFilter: null });

    expect(state).toEqual({
      status: 'error',
      message: 'That conversation could not be started.',
    });
    expect(dbState.revalidated).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('refuses a caller with no session', async () => {
    dbState.signedIn = false;

    const state = await createConversationAction({ spaceFilter: null });

    expect(state.status).toBe('error');
  });

  // Sign-in is settled before the input is read, so a signed-out caller gets one answer.
  it('tells a signed-out caller to sign in even when the input is also wrong', async () => {
    dbState.signedIn = false;

    const state = await createConversationAction({ spaceFilter: ['not-a-space'] });

    expect(state).toEqual({ status: 'error', message: 'You need to sign in to do that.' });
    expect(dbState.writes).toEqual([]);
  });
});

describe('renameConversationAction', () => {
  it('renames the conversation and revalidates the chat surface', async () => {
    const state = await renameConversationAction({
      conversationId: CONVERSATION_ID,
      title: '  SSO blockers  ',
    });

    expect(state).toEqual({ status: 'success', data: 'SSO blockers' });
    expect(dbState.writes[0]).toEqual({
      table: 'conversations',
      operation: 'update',
      values: { title: 'SSO blockers' },
      match: ['id', CONVERSATION_ID],
    });
    expect(dbState.revalidated).toEqual(['/chat']);
  });

  it('refuses an empty name', async () => {
    const state = await renameConversationAction({
      conversationId: CONVERSATION_ID,
      title: '   ',
    });

    expect(state.status).toBe('error');
    expect(dbState.writes).toEqual([]);
  });
});

describe('deleteConversationAction', () => {
  it('deletes the conversation', async () => {
    const state = await deleteConversationAction({ conversationId: CONVERSATION_ID });

    expect(state).toEqual({ status: 'success', data: CONVERSATION_ID });
    expect(dbState.writes[0]).toEqual({
      table: 'conversations',
      operation: 'delete',
      match: ['id', CONVERSATION_ID],
    });
  });

  it('refuses an id that is not a conversation', async () => {
    const state = await deleteConversationAction({ conversationId: 'nope' });

    expect(state.status).toBe('error');
    expect(dbState.writes).toEqual([]);
  });
});

const FOLDER_ID = '55555555-5555-4555-8555-555555555555';
const USER_ID = '77777777-7777-4777-8777-777777777777';

describe('createFolderAction', () => {
  it('files a folder against the caller and their organization', async () => {
    const state = await createFolderAction({ name: 'Launch', color: 'crimson' });

    expect(state.status).toBe('success');
    expect(dbState.writes[0]).toEqual({
      table: 'conversation_folders',
      operation: 'insert',
      values: { org_id: 'org-1', user_id: USER_ID, name: 'Launch', color: 'crimson' },
    });
  });

  it('trims the name rather than storing the spaces somebody typed', async () => {
    await createFolderAction({ name: '  Launch  ', color: 'gray' });

    expect((dbState.writes[0].values as { name: string }).name).toBe('Launch');
  });

  it('refuses a colour outside the ones a folder may take', async () => {
    const state = await createFolderAction({
      name: 'Launch',
      color: 'chartreuse' as never,
    });

    expect(state).toEqual({ status: 'error', message: 'That folder could not be changed.' });
    expect(dbState.writes).toHaveLength(0);
  });

  it('refuses a blank name without asking the database', async () => {
    const state = await createFolderAction({ name: '   ', color: 'gray' });

    expect(state.status).toBe('error');
    expect(dbState.writes).toHaveLength(0);
  });

  it('says the name is taken rather than reporting a database fault', async () => {
    dbState.error = { message: 'duplicate key value', code: '23505' };

    const state = await createFolderAction({ name: 'Launch', color: 'gray' });

    expect(state).toEqual({
      status: 'error',
      message: 'You already have a folder with that name.',
    });
  });
});

describe('renameFolderAction', () => {
  it('writes the new name and the new colour together', async () => {
    const state = await renameFolderAction({
      folderId: FOLDER_ID,
      name: 'Shipped',
      color: 'green',
    });

    expect(state).toEqual({ status: 'success', data: 'Shipped' });
    expect(dbState.writes[0]).toEqual({
      table: 'conversation_folders',
      operation: 'update',
      values: { name: 'Shipped', color: 'green' },
      match: ['id', FOLDER_ID],
    });
  });

  it('says the name is taken rather than reporting a database fault', async () => {
    dbState.error = { message: 'duplicate key value', code: '23505' };

    const state = await renameFolderAction({ folderId: FOLDER_ID, name: 'Launch', color: 'gray' });

    expect(state).toEqual({
      status: 'error',
      message: 'You already have a folder with that name.',
    });
  });
});

describe('deleteFolderAction', () => {
  it('deletes the folder and nothing else, so the conversations survive', async () => {
    const state = await deleteFolderAction({ folderId: FOLDER_ID });

    expect(state).toEqual({ status: 'success', data: FOLDER_ID });
    expect(dbState.writes).toEqual([
      { table: 'conversation_folders', operation: 'delete', match: ['id', FOLDER_ID] },
    ]);
  });
});

describe('moveConversationAction', () => {
  it('files a conversation into a folder', async () => {
    const state = await moveConversationAction({
      conversationId: CONVERSATION_ID,
      folderId: FOLDER_ID,
    });

    expect(state).toEqual({ status: 'success', data: FOLDER_ID });
    expect(dbState.writes[0]).toEqual({
      table: 'conversations',
      operation: 'update',
      values: { folder_id: FOLDER_ID },
      match: ['id', CONVERSATION_ID],
    });
  });

  // The top level is a destination, so null is a move and not a rejected input.
  it('moves a conversation back to the top level', async () => {
    const state = await moveConversationAction({
      conversationId: CONVERSATION_ID,
      folderId: null,
    });

    expect(state).toEqual({ status: 'success', data: null });
    expect((dbState.writes[0].values as { folder_id: string | null }).folder_id).toBeNull();
  });

  it('refuses a folder id that is not an id', async () => {
    const state = await moveConversationAction({
      conversationId: CONVERSATION_ID,
      folderId: 'launch',
    });

    expect(state.status).toBe('error');
    expect(dbState.writes).toHaveLength(0);
  });
});
