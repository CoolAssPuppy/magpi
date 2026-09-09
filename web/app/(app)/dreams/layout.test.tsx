import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DreamsLayout from './layout';

vi.mock('next/navigation', () => ({ usePathname: () => '/dreams' }));

describe('the dreams route', () => {
  it('defines the word in one sentence the first time it appears', () => {
    render(<DreamsLayout>{null}</DreamsLayout>);

    expect(screen.getByText(/dreaming is overnight processing/i)).toBeInTheDocument();
  });

  it('keeps the subtabs above the content, so a loading or error state cannot move them', () => {
    render(
      <DreamsLayout>
        <p>Something went wrong</p>
      </DreamsLayout>,
    );

    expect(screen.getByRole('navigation', { name: /dreams sections/i })).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
