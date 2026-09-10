import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DemoSignIn } from './demo-sign-in';
import { authClient } from './test-support';

const client = { current: authClient() };
const assign = vi.fn();

vi.mock('@/lib/supabase/client', () => ({ createClient: () => client.current.supabase }));

vi.stubGlobal('window', Object.assign(window, { location: { assign } }));

describe('the demo sign-in buttons', () => {
  // One question separates these three, which is the only reason there are three.
  it('offers the CEO, someone in Finance and someone in Marketing', () => {
    render(<DemoSignIn next="/chat" />);

    expect(screen.getByRole('button', { name: /Log in as CEO/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Log in as Finance/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Log in as Marketing/ })).toBeInTheDocument();
  });

  it.each([
    ['CEO', 'jane@example.com'],
    ['Finance', 'john@example.com'],
    ['Marketing', 'maya@example.com'],
  ])('signs in as the %s account without asking anyone to type a password', async (role, email) => {
    client.current = authClient();
    const { calls } = client.current;
    assign.mockClear();
    render(<DemoSignIn next="/chat" />);

    await userEvent.click(screen.getByRole('button', { name: new RegExp(`Log in as ${role}`) }));

    expect(calls).toEqual([
      { method: 'signInWithPassword', args: [{ email, password: 'supabasedemo' }] },
    ]);
    expect(assign).toHaveBeenCalledWith('/chat');
  });

  it('says how to create the accounts when they are not seeded yet', async () => {
    client.current = authClient({ error: { message: 'Invalid login credentials' } });
    render(<DemoSignIn next="/chat" />);

    await userEvent.click(screen.getByRole('button', { name: /Log in as CEO/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('scripts/seed-demo.mjs');
  });
});
