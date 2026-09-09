import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { successState } from '@/lib/actions/state';

import { SpaceDreaming, type DreamingSpace } from './space-dreaming';

const getSpace = (overrides?: Partial<DreamingSpace>): DreamingSpace => ({
  id: 'space-1',
  name: 'Engineering',
  dreaming_enabled: true,
  ...overrides,
});

const getActions = () => ({
  onToggle: vi.fn().mockResolvedValue(successState(undefined)),
  onRun: vi.fn().mockResolvedValue(successState(undefined)),
});

describe('dreaming, per space', () => {
  it('says what the switch controls before asking anyone to use it', () => {
    render(<SpaceDreaming spaces={[getSpace()]} {...getActions()} />);

    expect(
      screen.getByText(/reads one space and writes back into that space only/i),
    ).toBeInTheDocument();
  });

  it('turns dreaming off for one space', async () => {
    const actions = getActions();
    render(<SpaceDreaming spaces={[getSpace()]} {...actions} />);

    await userEvent.click(screen.getByRole('switch', { name: /dreaming in engineering/i }));

    expect(actions.onToggle).toHaveBeenCalledWith('space-1', false);
  });

  it('turns dreaming back on', async () => {
    const actions = getActions();
    render(<SpaceDreaming spaces={[getSpace({ dreaming_enabled: false })]} {...actions} />);

    await userEvent.click(screen.getByRole('switch', { name: /dreaming in engineering/i }));

    expect(actions.onToggle).toHaveBeenCalledWith('space-1', true);
  });

  it('runs one kind of dream over one space, on demand', async () => {
    const actions = getActions();
    render(<SpaceDreaming spaces={[getSpace()]} {...actions} />);

    const row = screen.getByRole('group', { name: 'Engineering' });
    await userEvent.selectOptions(within(row).getByLabelText(/kind/i), 'entities');
    await userEvent.click(within(row).getByRole('button', { name: /run now/i }));

    expect(actions.onRun).toHaveBeenCalledWith('space-1', 'entities');
  });

  it('will not run a dream in a space where dreaming is switched off', () => {
    render(<SpaceDreaming spaces={[getSpace({ dreaming_enabled: false })]} {...getActions()} />);

    expect(screen.getByRole('button', { name: /run now/i })).toBeDisabled();
    expect(screen.getByText(/dreaming is off in this space/i)).toBeInTheDocument();
  });

  it('keeps the switch where the save left it', async () => {
    const actions = getActions();
    render(<SpaceDreaming spaces={[getSpace()]} {...actions} />);

    await userEvent.click(screen.getByRole('switch', { name: /dreaming in engineering/i }));

    expect(await screen.findByText(/dreaming is off in this space/i)).toBeInTheDocument();
  });

  it('leaves the switch alone when the save was refused', async () => {
    const actions = getActions();
    actions.onToggle.mockResolvedValue({ status: 'error', message: 'Not allowed.' });
    render(<SpaceDreaming spaces={[getSpace()]} {...actions} />);

    await userEvent.click(screen.getByRole('switch', { name: /dreaming in engineering/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /dreaming in engineering/i })).toBeChecked();
  });

  it('reports a refused run', async () => {
    const actions = getActions();
    actions.onRun.mockResolvedValue({ status: 'error', message: 'A run is already going.' });
    render(<SpaceDreaming spaces={[getSpace()]} {...actions} />);

    await userEvent.click(screen.getByRole('button', { name: /run now/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A run is already going.');
  });
});
