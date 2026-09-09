import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authServer } from '../test-support';

const ORIGIN = 'https://recall.test';
const TOKEN_HASH = 'pkce_9f2c4a1b';

const server = { current: authServer() };

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => server.current.supabase }));

const { GET } = await import('./route');

const goTrue = (error: { message: string } | null = null) => {
  server.current = authServer(error);
  return server.current;
};

const follow = async (query: string) => {
  const response = await GET(new NextRequest(`${ORIGIN}/auth/confirm${query}`));
  return response.headers.get('location');
};

beforeEach(() => {
  goTrue();
});

describe('the link in a confirmation email', () => {
  it('signs the reader in and drops them where the link said to go', async () => {
    const { calls } = goTrue();

    const landing = await follow(`?token_hash=${TOKEN_HASH}&type=recovery&next=/update-password`);

    expect(calls).toEqual([
      { method: 'verifyOtp', args: [{ type: 'recovery', token_hash: TOKEN_HASH }] },
    ]);
    expect(landing).toBe(`${ORIGIN}/update-password`);
  });

  it('sends a reader who confirmed a new account into chat', async () => {
    expect(await follow(`?token_hash=${TOKEN_HASH}&type=signup`)).toBe(`${ORIGIN}/chat`);
  });

  it('refuses to let a tampered link forward the reader to another site', async () => {
    const landing = await follow(
      `?token_hash=${TOKEN_HASH}&type=signup&next=${encodeURIComponent('https://evil.example/steal')}`,
    );

    expect(landing).toBe(`${ORIGIN}/chat`);
  });

  it('explains the failure rather than verifying a link with no token on it', async () => {
    const { calls } = goTrue();

    const landing = await follow('?type=signup');

    expect(landing).toBe(`${ORIGIN}/auth/error?error=No%20token%20hash%20or%20type`);
    expect(calls).toEqual([]);
  });

  it('explains the failure when the link says nothing about what it is confirming', async () => {
    expect(await follow(`?token_hash=${TOKEN_HASH}`)).toBe(
      `${ORIGIN}/auth/error?error=No%20token%20hash%20or%20type`,
    );
  });

  it('carries what the auth server said onto the error screen when a link has expired', async () => {
    goTrue({ message: 'Email link is invalid or has expired' });

    const landing = await follow(`?token_hash=${TOKEN_HASH}&type=recovery`);

    expect(landing).toBe(
      `${ORIGIN}/auth/error?error=Email%20link%20is%20invalid%20or%20has%20expired`,
    );
  });
});
