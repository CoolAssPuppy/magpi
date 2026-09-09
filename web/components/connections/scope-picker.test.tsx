import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ScopeSelection } from '@/lib/connections/scope-selection';

import { ScopePicker } from './scope-picker';

const getSelection = (): ScopeSelection => ({
  kind: 'set',
  selectionKind: 'channel',
  available: [
    { id: 'C1', name: 'general' },
    { id: 'C2', name: 'engineering' },
    { id: 'C3', name: 'design' },
  ],
  selected: ['C1'],
});

describe('the scope picker', () => {
  it('lists what the source offered and shows what is already chosen', () => {
    render(<ScopePicker selection={getSelection()} selected={['C1']} onChange={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: 'general' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'engineering' })).not.toBeChecked();
  });

  it('adds a channel a person ticks', async () => {
    const onChange = vi.fn();
    render(<ScopePicker selection={getSelection()} selected={['C1']} onChange={onChange} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'engineering' }));

    expect(onChange).toHaveBeenCalledWith(['C1', 'C2']);
  });

  it('removes a channel a person unticks', async () => {
    const onChange = vi.fn();
    render(<ScopePicker selection={getSelection()} selected={['C1']} onChange={onChange} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'general' }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('counts the selection as it stands', () => {
    render(<ScopePicker selection={getSelection()} selected={['C1', 'C2']} onChange={vi.fn()} />);

    expect(screen.getByText('2 of 3 channels')).toBeInTheDocument();
  });

  it('says what reading nothing means when nothing is ticked', () => {
    render(<ScopePicker selection={getSelection()} selected={[]} onChange={vi.fn()} />);

    expect(screen.getByText(/reads nothing from this source/i)).toBeInTheDocument();
  });

  it('explains itself rather than showing an empty list before the source has answered', () => {
    render(<ScopePicker selection={{ kind: 'unset' }} selected={[]} onChange={vi.fn()} />);

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByText(/has not listed/i)).toBeInTheDocument();
  });

  it('says a whole-workspace source reads everything, rather than faking a choice', () => {
    render(
      <ScopePicker
        selection={{
          kind: 'set',
          selectionKind: 'workspace',
          available: [{ id: 'W1', name: 'Acme' }],
          selected: ['W1'],
        }}
        selected={['W1']}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByText(/the whole workspace/i)).toBeInTheDocument();
  });
});
