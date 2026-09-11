import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationFolder } from '@/hooks/use-conversation-folders';
import type { ActionState } from '@/lib/actions/state';

const FOLDER_ID = '55555555-5555-4555-8555-555555555555';

const actions = {
  rename: { status: 'success', data: 'Pricing' } as ActionState<string>,
  remove: { status: 'success', data: FOLDER_ID } as ActionState<string>,
  renameInput: null as unknown,
  removeInput: null as unknown,
};

vi.mock('@/app/(app)/chat/actions', () => ({
  renameFolderAction: async (input: unknown) => {
    actions.renameInput = input;
    return actions.rename;
  },
  deleteFolderAction: async (input: unknown) => {
    actions.removeInput = input;
    return actions.remove;
  },
}));

const { FolderMenu } = await import('./folder-menu');

/** Typing key by key at the default delay times the suite out under load. */
const user = userEvent.setup({ delay: null });

const onChanged = vi.fn();

const getFolder = (overrides: Partial<ConversationFolder> = {}): ConversationFolder => ({
  id: FOLDER_ID,
  name: 'Pricing',
  color: 'gray',
  ...overrides,
});

async function openMenuItem(name: string, folder: ConversationFolder = getFolder()) {
  render(<FolderMenu folder={folder} onChanged={onChanged} />);
  await user.click(screen.getByRole('button', { name: `Actions for folder ${folder.name}` }));
  await user.click(await screen.findByRole('menuitem', { name }));
}

beforeEach(() => {
  onChanged.mockClear();
  actions.rename = { status: 'success', data: 'Pricing' };
  actions.remove = { status: 'success', data: FOLDER_ID };
  actions.renameInput = null;
  actions.removeInput = null;
});

describe('FolderMenu', () => {
  it('starts the rename from the name and colour the folder already has', async () => {
    await openMenuItem('Rename', getFolder({ color: 'amber' }));

    expect(screen.getByLabelText('Name')).toHaveValue('Pricing');
    expect(screen.getByRole('radio', { name: 'Amber' })).toHaveAttribute('aria-checked', 'true');
  });

  it('sends the new name and the new colour together', async () => {
    await openMenuItem('Rename');

    const field = screen.getByLabelText('Name');
    await user.clear(field);
    await user.type(field, 'Deals');
    await user.click(screen.getByRole('radio', { name: 'Purple' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(actions.renameInput).toEqual({
      folderId: FOLDER_ID,
      name: 'Deals',
      color: 'purple',
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it('repeats the reason a rename was refused, and keeps the dialog open', async () => {
    actions.rename = { status: 'error', message: 'You already have a folder with that name.' };
    await openMenuItem('Rename');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You already have a folder with that name.',
    );
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('will not save a folder with no name at all', async () => {
    await openMenuItem('Rename');

    await user.clear(screen.getByLabelText('Name'));

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('says the conversations are kept, and deletes nothing until it is confirmed', async () => {
    await openMenuItem('Delete');

    expect(
      screen.getByText(
        'The conversations in it are kept. They move to the top level of the sidebar.',
      ),
    ).toBeInTheDocument();
    expect(actions.removeInput).toBeNull();
  });

  it('deletes the folder on confirmation', async () => {
    await openMenuItem('Delete');

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(actions.removeInput).toEqual({ folderId: FOLDER_ID });
    expect(onChanged).toHaveBeenCalled();
  });

  it('says why a delete was refused', async () => {
    actions.remove = { status: 'error', message: 'You need to sign in to do that.' };
    await openMenuItem('Delete');

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You need to sign in to do that.');
  });

  it('closes the delete dialog on cancel', async () => {
    await openMenuItem('Delete');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(actions.removeInput).toBeNull();
  });
});
