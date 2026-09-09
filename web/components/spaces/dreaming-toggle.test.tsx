import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { successState } from '@/lib/actions/state';

const SPACE_ID = '33333333-3333-4333-8333-333333333333';

const change = {
  submitted: [] as FormData[],
  /** Held open so the switch can be looked at while the write is still running. */
  hold: false,
  release: null as (() => void) | null,
};

vi.mock('@/app/(app)/spaces/actions', () => ({
  setDreaming: async (formData: FormData) => {
    change.submitted.push(formData);
    if (change.hold) {
      await new Promise<void>((resolve) => {
        change.release = resolve;
      });
    }
    return successState(undefined);
  },
}));

const { DreamingToggle } = await import('./dreaming-toggle');

const theSwitch = () =>
  screen.getByRole('switch', { name: 'Run dreaming on this space overnight' });

beforeEach(() => {
  change.submitted = [];
  change.hold = false;
  change.release = null;
});

describe('the dreaming switch', () => {
  it('says what dreaming does before asking anyone to switch it on', () => {
    render(<DreamingToggle spaceId={SPACE_ID} enabled={false} />);

    expect(screen.getByText(/re-reads what came into this space that day/i)).toBeInTheDocument();
    expect(screen.getByText(/Everything it writes cites its sources/i)).toBeInTheDocument();
  });

  it('shows dreaming already on for a space that dreams', () => {
    render(<DreamingToggle spaceId={SPACE_ID} enabled />);

    expect(theSwitch()).toBeChecked();
  });

  it('turns dreaming on for this space and no other', async () => {
    render(<DreamingToggle spaceId={SPACE_ID} enabled={false} />);

    await userEvent.click(theSwitch());

    expect(change.submitted).toHaveLength(1);
    expect(change.submitted[0].get('spaceId')).toBe(SPACE_ID);
    expect(change.submitted[0].get('enabled')).toBe('true');
  });

  it('turns dreaming off again', async () => {
    render(<DreamingToggle spaceId={SPACE_ID} enabled />);

    await userEvent.click(theSwitch());

    expect(change.submitted[0].get('enabled')).toBe('false');
  });

  it('takes no second click while the first write is still running', async () => {
    change.hold = true;
    render(<DreamingToggle spaceId={SPACE_ID} enabled={false} />);

    await userEvent.click(theSwitch());
    expect(theSwitch()).toBeDisabled();

    await userEvent.click(theSwitch());
    expect(change.submitted).toHaveLength(1);

    await act(async () => {
      change.release?.();
    });

    expect(theSwitch()).toBeEnabled();
  });
});
