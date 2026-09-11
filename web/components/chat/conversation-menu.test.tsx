import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationFolder } from '@/hooks/use-conversation-folders';
import type { ActionState } from '@/lib/actions/state';

const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';
const FOLDER_ID = '55555555-5555-4555-8555-555555555555';

const router = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() };
const actions = {
  rename: { status: 'success', data: 'Renamed' } as ActionState<string>,
  remove: { status: 'success', data: CONVERSATION_ID } as ActionState<string>,
  move: { status: 'success', data: FOLDER_ID } as ActionState<string | null>,
  renameInput: null as unknown,
  removeInput: null as unknown,
  moveInput: null as unknown,
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
  moveConversationAction: async (input: unknown) => {
    actions.moveInput = input;
    return actions.move;
  },
}));

const { ConversationMenu } = await import('./conversation-menu');

/** Typing key by key at the default delay times the suite out under load. */
const user = userEvent.setup({ delay: null });

const onMoved = vi.fn();

const getFolders = (): ConversationFolder[] => [{ id: FOLDER_ID, name: 'Pricing', color: 'gray' }];

function renderMenu(folderId: string | null = null) {
  render(
    <ConversationMenu
      conversationId={CONVERSATION_ID}
      title="SSO blockers"
      folderId={folderId}
      folders={getFolders()}
      onMoved={onMoved}
    />,
  );
}

async function openMenu(folderId: string | null = null) {
  renderMenu(folderId);
  await user.click(screen.getByRole('button', { name: 'Actions for SSO blockers' }));
}

async function openMenuItem(name: string) {
  await openMenu();
  await user.click(await screen.findByRole('menuitem', { name }));
}

/** Radix keeps its options out of the DOM until the trigger opens, unlike a native select. */
async function openFolderChoices(folderId: string | null = null) {
  await openMenu(folderId);
  await user.click(await screen.findByRole('menuitem', { name: 'Move to folder' }));
  await user.click(screen.getByRole('combobox', { name: 'Folder' }));
  return screen.findByRole('listbox');
}

beforeEach(() => {
  router.push.mockClear();
  router.refresh.mockClear();
  onMoved.mockClear();
  actions.rename = { status: 'success', data: 'Renamed' };
  actions.remove = { status: 'success', data: CONVERSATION_ID };
  actions.move = { status: 'success', data: FOLDER_ID };
  actions.renameInput = null;
  actions.removeInput = null;
  actions.moveInput = null;
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

  it('says why a delete was refused, and deletes nothing', async () => {
    actions.remove = { status: 'error', message: 'You need to sign in to do that.' };
    await openMenuItem('Delete');

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You need to sign in to do that.');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('leaves the conversation alone when the dialog is cancelled', async () => {
    await openMenuItem('Rename');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('Name')).toBeNull();
    expect(actions.renameInput).toBeNull();
  });

  it('closes the dialog on Escape', async () => {
    await openMenuItem('Rename');

    await user.keyboard('{Escape}');

    expect(screen.queryByLabelText('Name')).toBeNull();
  });

  it('deletes on confirmation and leaves for the chat screen', async () => {
    await openMenuItem('Delete');

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(actions.removeInput).toEqual({ conversationId: CONVERSATION_ID });
    expect(router.push).toHaveBeenCalledWith('/chat');
  });

  it('offers every folder alongside the top level', async () => {
    await openFolderChoices();

    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['No folder', 'Pricing']);
  });

  it('shows where the conversation is filed now', async () => {
    await openMenu(FOLDER_ID);
    await user.click(await screen.findByRole('menuitem', { name: 'Move to folder' }));

    expect(screen.getByRole('combobox', { name: 'Folder' })).toHaveTextContent('Pricing');
  });

  it('moves the conversation into the folder that was picked', async () => {
    await openFolderChoices();

    await user.click(await screen.findByRole('option', { name: 'Pricing' }));
    await user.click(screen.getByRole('button', { name: 'Move' }));

    expect(actions.moveInput).toEqual({
      conversationId: CONVERSATION_ID,
      folderId: FOLDER_ID,
    });
    expect(onMoved).toHaveBeenCalled();
  });

  it('takes the conversation back to the top level with no folder', async () => {
    await openFolderChoices(FOLDER_ID);

    await user.click(await screen.findByRole('option', { name: 'No folder' }));
    await user.click(screen.getByRole('button', { name: 'Move' }));

    expect(actions.moveInput).toEqual({
      conversationId: CONVERSATION_ID,
      folderId: null,
    });
    expect(onMoved).toHaveBeenCalled();
  });

  it('moves nothing until the move is confirmed', async () => {
    await openFolderChoices();

    await user.click(await screen.findByRole('option', { name: 'Pricing' }));

    expect(actions.moveInput).toBeNull();
  });

  it('says so when a move was refused, and keeps the dialog open', async () => {
    actions.move = { status: 'error', message: 'That conversation could not be moved.' };
    await openFolderChoices();

    await user.click(await screen.findByRole('option', { name: 'Pricing' }));
    await user.click(screen.getByRole('button', { name: 'Move' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That conversation could not be moved.',
    );
    expect(screen.getByRole('combobox', { name: 'Folder' })).toBeInTheDocument();
    expect(onMoved).not.toHaveBeenCalled();
  });
});
