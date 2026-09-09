import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionState } from '@/lib/actions/state';

const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';

const router = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() };
const actions = {
  rename: { status: 'success', data: 'Renamed' } as ActionState<string>,
  remove: { status: 'success', data: CONVERSATION_ID } as ActionState<string>,
  renameInput: null as unknown,
  removeInput: null as unknown,
};

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock('@/app/(app)/chat/actions', () => ({
  renameConversationAction: async (input: unknown) => {
    actions.renameInput = input;
    return actions.rename;
  },
  deleteConversationAction: async (input: unknown) => {
    actions.removeInput = input;
    return actions.remove;
  },
}));

const { ConversationMenu } = await import('./conversation-menu');

/** Typing key by key at the default delay times the suite out under load. */
const user = userEvent.setup({ delay: null });

async function openMenuItem(name: string) {
  render(<ConversationMenu conversationId={CONVERSATION_ID} title="SSO blockers" />);
  await user.click(screen.getByRole('button', { name: 'Actions for SSO blockers' }));
  await user.click(await screen.findByRole('menuitem', { name }));
}

beforeEach(() => {
  router.push.mockClear();
  router.refresh.mockClear();
  actions.rename = { status: 'success', data: 'Renamed' };
  actions.remove = { status: 'success', data: CONVERSATION_ID };
});

describe('ConversationMenu', () => {
  it('renames the conversation', async () => {
    await openMenuItem('Rename');

    const field = screen.getByLabelText('Name');
    await user.clear(field);
    await user.type(field, 'SSO rollout');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(actions.renameInput).toEqual({
      conversationId: CONVERSATION_ID,
      title: 'SSO rollout',
    });
    expect(router.refresh).toHaveBeenCalled();
  });

  it('says why a rename was refused, and keeps the dialog open', async () => {
    actions.rename = { status: 'error', message: 'You need to sign in to do that.' };
    await openMenuItem('Rename');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You need to sign in to do that.');
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('asks before it deletes, and says what goes with it', async () => {
    await openMenuItem('Delete');

    expect(
      screen.getByText('This deletes the questions and answers in this conversation.'),
    ).toBeInTheDocument();
    expect(actions.removeInput).toBeNull();
  });

  it('deletes on confirmation and leaves for the chat screen', async () => {
    await openMenuItem('Delete');

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(actions.removeInput).toEqual({ conversationId: CONVERSATION_ID });
    expect(router.push).toHaveBeenCalledWith('/chat');
  });
});
