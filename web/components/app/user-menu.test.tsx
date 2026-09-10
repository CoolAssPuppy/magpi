import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { authClient } from '@/components/auth/test-support';

import { UserMenu } from './user-menu';

const client = { current: authClient() };
const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => client.current.supabase }));
vi.mock('@/components/current-user-avatar', () => ({
  CurrentUserAvatar: () => <span>avatar</span>,
}));

const open = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Your account' }));
};

describe('the account menu', () => {
  it('keeps settings and signing out behind the avatar rather than in the header', async () => {
    render(<UserMenu email="reader@example.com" canAdminister={false} />);
    await open();

    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('offers admin only to someone who can administer the organization', async () => {
    render(<UserMenu email="reader@example.com" canAdminister={true} />);
    await open();

    expect(screen.getByRole('menuitem', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  });

  it('does not offer admin to a member', async () => {
    render(<UserMenu email="reader@example.com" canAdminister={false} />);
    await open();

    expect(screen.queryByRole('menuitem', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('names the signed-in reader, and says nothing when there is no address', async () => {
    const { unmount } = render(<UserMenu email="reader@example.com" canAdminister={false} />);
    await open();
    expect(screen.getByText('reader@example.com')).toBeInTheDocument();
    unmount();

    render(<UserMenu email={null} canAdminister={false} />);
    await open();
    expect(screen.queryByText('reader@example.com')).not.toBeInTheDocument();
  });

  it('ends the session, sends the reader to sign in, and re-reads the page behind them', async () => {
    client.current = authClient();
    const { calls } = client.current;
    push.mockClear();
    refresh.mockClear();

    render(<UserMenu email="reader@example.com" canAdminister={false} />);
    await open();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));

    expect(calls).toEqual([{ method: 'signOut', args: [] }]);
    expect(push).toHaveBeenCalledWith('/sign-in');
    expect(refresh).toHaveBeenCalled();
  });
});
