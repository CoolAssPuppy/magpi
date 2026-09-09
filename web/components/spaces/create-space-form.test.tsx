import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionState } from '@/lib/actions/state';

const SPACE_ID = '33333333-3333-4333-8333-333333333333';

const creation = {
  result: { status: 'success', data: { id: SPACE_ID } } as ActionState<{ id: string }>,
  submitted: null as FormData | null,
  /** Held open so the form can be looked at while the action is still running. */
  hold: false,
  release: null as (() => void) | null,
};

vi.mock('@/app/(app)/spaces/actions', () => ({
  createTeamSpace: async (formData: FormData) => {
    creation.submitted = formData;
    if (creation.hold) {
      await new Promise<void>((resolve) => {
        creation.release = resolve;
      });
    }
    return creation.result;
  },
}));

const { CreateSpaceForm } = await import('./create-space-form');

/** Typing key by key at the default delay times the suite out under load. */
const user = userEvent.setup({ delay: null });

beforeEach(() => {
  creation.result = { status: 'success', data: { id: SPACE_ID } };
  creation.submitted = null;
  creation.hold = false;
  creation.release = null;
});

async function nameAndSubmit(name: string) {
  await user.type(screen.getByLabelText('New team space'), name);
  await user.click(screen.getByRole('button', { name: 'Create' }));
}

describe('creating a team space', () => {
  it('creates the space under the name the person typed', async () => {
    render(<CreateSpaceForm />);

    await nameAndSubmit('Growth');

    expect(creation.submitted?.get('name')).toBe('Growth');
  });

  it('says nothing is wrong before anyone has tried', () => {
    render(<CreateSpaceForm />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the reason the space was refused', async () => {
    creation.result = { status: 'error', message: 'A space needs a name.' };
    render(<CreateSpaceForm />);

    await nameAndSubmit('Growth');

    expect(await screen.findByRole('alert')).toHaveTextContent('A space needs a name.');
  });

  it('leaves no error behind once a space is created', async () => {
    render(<CreateSpaceForm />);

    await nameAndSubmit('Growth');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('will not take a second space while the first is still being created', async () => {
    creation.hold = true;
    render(<CreateSpaceForm />);

    await nameAndSubmit('Growth');

    const button = await screen.findByRole('button', { name: 'Creating' });
    expect(button).toBeDisabled();

    await act(async () => {
      creation.release?.();
    });

    expect(await screen.findByRole('button', { name: 'Create' })).toBeEnabled();
  });
});
