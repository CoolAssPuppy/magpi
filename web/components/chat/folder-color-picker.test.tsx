import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FOLDER_COLOR_ORDER, type FolderColor } from '@/lib/chat/folder-colors';

import { FolderColorPicker } from './folder-color-picker';

const user = userEvent.setup({ delay: null });

type PickerProps = {
  readonly value: FolderColor;
  readonly onChange: (color: FolderColor) => void;
};

const getProps = (overrides: Partial<PickerProps> = {}): PickerProps => ({
  value: 'gray',
  onChange: vi.fn(),
  ...overrides,
});

describe('FolderColorPicker', () => {
  it('offers every colour a folder is allowed to be', () => {
    render(<FolderColorPicker {...getProps()} />);

    expect(screen.getAllByRole('radio')).toHaveLength(FOLDER_COLOR_ORDER.length);
    expect(screen.getByRole('radio', { name: 'Indigo' })).toBeInTheDocument();
  });

  it('tells a screen reader which colour is chosen rather than only showing it', () => {
    render(<FolderColorPicker {...getProps({ value: 'blue' })} />);

    expect(screen.getByRole('radio', { name: 'Blue' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Gray' })).toHaveAttribute('aria-checked', 'false');
  });

  it('puts a tick on the chosen colour, so the eye is not asked to judge hue', () => {
    render(<FolderColorPicker {...getProps({ value: 'blue' })} />);

    expect(screen.getByRole('radio', { name: 'Blue' }).querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('radio', { name: 'Gray' }).querySelector('svg')).toBeNull();
  });

  it('reports the colour a person picks', async () => {
    const onChange = vi.fn();
    render(<FolderColorPicker {...getProps({ onChange })} />);

    await user.click(screen.getByRole('radio', { name: 'Crimson' }));

    expect(onChange).toHaveBeenCalledWith('crimson');
  });
});
