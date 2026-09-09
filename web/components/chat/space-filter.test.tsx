import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SpaceFilter, type SpaceOption } from './space-filter';

const user = userEvent.setup({ delay: null });

const SPACES: readonly SpaceOption[] = [
  { id: '33333333-3333-4333-8333-333333333333', name: 'Personal' },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Everyone' },
];

function renderFilter(selected: readonly string[] = []) {
  const onChange = vi.fn();
  render(<SpaceFilter spaces={SPACES} selected={selected} onChange={onChange} />);
  return { onChange };
}

describe('SpaceFilter', () => {
  it('says it is searching everything until a space is picked', () => {
    renderFilter();

    expect(screen.getByRole('button', { name: 'Search scope: All spaces' })).toBeInTheDocument();
  });

  it('names the one space it was narrowed to', () => {
    renderFilter([SPACES[0].id]);

    expect(screen.getByRole('button', { name: 'Search scope: Personal' })).toBeInTheDocument();
  });

  it('counts the spaces once there is more than one', () => {
    renderFilter([SPACES[0].id, SPACES[1].id]);

    expect(screen.getByRole('button', { name: 'Search scope: 2 spaces' })).toBeInTheDocument();
  });

  it('adds a space to the scope', async () => {
    const { onChange } = renderFilter();

    await user.click(screen.getByRole('button', { name: 'Search scope: All spaces' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Personal' }));

    expect(onChange).toHaveBeenCalledWith([SPACES[0].id]);
  });

  it('takes a space back out of the scope', async () => {
    const { onChange } = renderFilter([SPACES[0].id]);

    await user.click(screen.getByRole('button', { name: 'Search scope: Personal' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Personal' }));

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
