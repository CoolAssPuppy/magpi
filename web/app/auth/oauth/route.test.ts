import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authServer } from '../test-support';

const ORIGIN = 'https://magpi.test';
const CODE = 'e1b0c44298fc';

const server = { current: authServer() };

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => server.current.supabase }));

const { GET } = await import('./route');

const goTrue = (error: { message: string } | null = null) => {
  server.current = authServer(error);
  return server.current;
};

const comeBackFromGitHub = async (query: string, headers?: Record<string, string>) => {
  const response = await GET(new NextRequest(`${ORIGIN}/auth/oauth${query}`, { headers }));
  return response.headers.get('location');
};

beforeEach(() => {
  goTrue();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('coming back from GitHub', () => {
  it('trades the code for a session and drops the reader where they were headed', async () => {
    const { calls } = goTrue();

    const landing = await comeBackFromGitHub(`?code=${CODE}&next=/chat/abc`);

    expect(calls).toEqual([{ method: 'exchangeCodeForSession', args: [CODE] }]);
    expect(landing).toBe(`${ORIGIN}/chat/abc`);
  });

  it('refuses to forward the reader to another site on the way back in', async () => {
    const landing = await comeBackFromGitHub(
      `?code=${CODE}&next=${encodeURIComponent('https://evil.example/steal')}`,
    );

    expect(landing).toBe(`${ORIGIN}/chat`);
  });

  it('explains the failure rather than trading a code it never got', async () => {
    const { calls } = goTrue();

    const landing = await comeBackFromGitHub('?error=access_denied');

    expect(landing).toBe(`${ORIGIN}/auth/error?error=No%20authorization%20code`);
    expect(calls).toEqual([]);
  });

  it('carries what the auth server said onto the error screen when the code is spent', async () => {
    goTrue({ message: 'invalid request: both auth code and code verifier should be non-empty' });

    const landing = await comeBackFromGitHub(`?code=${CODE}`);

    expect(landing).toBe(
      `${ORIGIN}/auth/error?error=invalid%20request%3A%20both%20auth%20code%20and%20code%20verifier%20should%20be%20non-empty`,
    );
  });

  it('lands the reader on the host they typed, not the load balancer behind it', async () => {
    const landing = await comeBackFromGitHub(`?code=${CODE}&next=/chat/abc`, {
      'x-forwarded-host': 'magpi.app',
    });

    expect(landing).toBe('https://magpi.app/chat/abc');
  });

  it('ignores a forwarded host in development, where nothing sits in front of the app', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const landing = await comeBackFromGitHub(`?code=${CODE}&next=/chat/abc`, {
      'x-forwarded-host': 'magpi.app',
    });

    expect(landing).toBe(`${ORIGIN}/chat/abc`);
  });
});
