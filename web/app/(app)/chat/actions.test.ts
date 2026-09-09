import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionState } from '@/lib/actions/state';
import type { SessionContext } from '@/lib/supabase/context';

const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';
const SPACE_ID = '33333333-3333-4333-8333-333333333333';

type Write = { table: string; operation: string; values?: unknown; match?: unknown };

const dbState = {
  writes: [] as Write[],
  error: null as { message: string } | null,
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

const { createConversationAction, deleteConversationAction, renameConversationAction } =
  await import('./actions');

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

  it('answers with the failure rather than a conversation id', async () => {
    dbState.error = { message: 'new row violates row-level security' };

    const state = await createConversationAction({ spaceFilter: null });

    expect(state).toEqual({
      status: 'error',
      message: 'new row violates row-level security',
    });
    expect(dbState.revalidated).toEqual([]);
  });

  it('refuses a caller with no session', async () => {
    dbState.signedIn = false;

    const state = await createConversationAction({ spaceFilter: null });

    expect(state.status).toBe('error');
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
