import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionState } from '@/lib/actions/state';

const FOLDER_ID = '66666666-6666-4666-8666-666666666666';

const actions = {
  create: { status: 'success', data: FOLDER_ID } as ActionState<string>,
  createInput: null as unknown,
};

vi.mock('@/app/(app)/chat/actions', () => ({
  createFolderAction: async (input: unknown) => {
    actions.createInput = input;
    return actions.create;
  },
}));

const { NewFolderButton } = await import('./new-folder-button');

/** Typing key by key at the default delay times the suite out under load. */
const user = userEvent.setup({ delay: null });

const onCreated = vi.fn();

async function openTheDialog() {
  render(<NewFolderButton onCreated={onCreated} />);
  await user.click(screen.getByRole('button', { name: 'New folder' }));
}

beforeEach(() => {
  onCreated.mockClear();
  actions.create = { status: 'success', data: FOLDER_ID };
  actions.createInput = null;
});

describe('NewFolderButton', () => {
  it('opens on an empty name and the default colour', async () => {
    await openTheDialog();

    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getByRole('radio', { name: 'Gray' })).toHaveAttribute('aria-checked', 'true');
  });

  it('creates the folder with the name and the colour that were chosen', async () => {
    await openTheDialog();

    await user.type(screen.getByLabelText('Name'), 'Pricing');
    await user.click(screen.getByRole('radio', { name: 'Blue' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(actions.createInput).toEqual({ name: 'Pricing', color: 'blue' });
    expect(onCreated).toHaveBeenCalled();
  });

  it('will not create a folder with no name', async () => {
    await openTheDialog();

    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('repeats the reason the folder was refused, and keeps what was typed', async () => {
    actions.create = { status: 'error', message: 'You already have a folder with that name.' };
    await openTheDialog();

    await user.type(screen.getByLabelText('Name'), 'Pricing');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You already have a folder with that name.',
    );
    expect(screen.getByLabelText('Name')).toHaveValue('Pricing');
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('creates nothing when the dialog is cancelled', async () => {
    await openTheDialog();

    await user.type(screen.getByLabelText('Name'), 'Pricing');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(actions.createInput).toBeNull();
    expect(screen.queryByLabelText('Name')).toBeNull();
  });
});
