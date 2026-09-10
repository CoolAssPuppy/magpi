import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DemoSignIn } from './demo-sign-in';
import { authClient } from './test-support';

const client = { current: authClient() };
const assign = vi.fn();

vi.mock('@/lib/supabase/client', () => ({ createClient: () => client.current.supabase }));

vi.stubGlobal('window', Object.assign(window, { location: { assign } }));

describe('the demo sign-in button', () => {
  it('signs in as the seeded demo account without asking anyone to type a password', async () => {
    client.current = authClient();
    const { calls } = client.current;
    render(<DemoSignIn next="/chat" />);

    await userEvent.click(screen.getByRole('button', { name: 'Log in as Jane' }));

    expect(calls).toEqual([
      {
        method: 'signInWithPassword',
        args: [{ email: 'jane@example.com', password: 'supabasedemo' }],
      },
    ]);
    expect(assign).toHaveBeenCalledWith('/chat');
  });

  it('says how to create the account when it is not seeded yet', async () => {
    client.current = authClient({ error: { message: 'Invalid login credentials' } });
    render(<DemoSignIn next="/chat" />);

    await userEvent.click(screen.getByRole('button', { name: 'Log in as Jane' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('scripts/seed-demo.mjs');
  });
});
