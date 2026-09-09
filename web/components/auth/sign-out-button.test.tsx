import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SignOutButton } from './sign-out-button';
import { authClient } from './test-support';

const client = { current: authClient() };
const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => client.current.supabase }));

describe('signing out', () => {
  it('ends the session, sends the reader to sign in, and re-reads the page behind them', async () => {
    client.current = authClient();
    const { calls } = client.current;
    render(<SignOutButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(calls).toEqual([{ method: 'signOut', args: [] }]);
    expect(push).toHaveBeenCalledWith('/sign-in');
    expect(refresh).toHaveBeenCalled();
  });
});
