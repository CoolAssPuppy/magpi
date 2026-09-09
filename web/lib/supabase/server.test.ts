import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Cookie = { readonly name: string; readonly value: string };
type CookieWrite = Cookie & { readonly options?: Record<string, unknown> };

type CookieHandlers = {
  readonly getAll: () => readonly Cookie[];
  readonly setAll: (cookies: readonly CookieWrite[]) => void;
};

const jar = {
  written: [] as CookieWrite[],
  sent: [] as Cookie[],
  readOnly: false,
};

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...jar.sent],
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      if (jar.readOnly) throw new Error('Cookies can only be modified in a Server Action');
      jar.written.push({ name, value, options });
    },
  }),
}));

const built: { url: string; key: string; cookies: CookieHandlers }[] = [];

vi.mock('@supabase/ssr', () => ({
  createServerClient: (url: string, key: string, options: { cookies: CookieHandlers }) => {
    built.push({ url, key, cookies: options.cookies });
    return {};
  },
}));

const { createClient } = await import('./server');

const configured = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};

beforeEach(() => {
  built.length = 0;
  jar.written = [];
  jar.sent = [{ name: 'sb-access-token', value: 'sent-by-the-browser' }];
  jar.readOnly = false;
});

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = configured.publishableKey;
});

describe('the server client', () => {
  it('talks to the configured project with the publishable key', async () => {
    await createClient();

    expect(built).toEqual([
      expect.objectContaining({ url: configured.url, key: configured.publishableKey }),
    ]);
  });

  it('reads the cookies the browser sent, which is where the session lives', async () => {
    await createClient();

    expect(built[0].cookies.getAll()).toEqual([
      { name: 'sb-access-token', value: 'sent-by-the-browser' },
    ]);
  });

  it('writes a refreshed session back to the browser', async () => {
    await createClient();

    built[0].cookies.setAll([
      { name: 'sb-access-token', value: 'refreshed', options: { httpOnly: true } },
      { name: 'sb-refresh-token', value: 'rotated', options: { httpOnly: true } },
    ]);

    expect(jar.written).toEqual([
      { name: 'sb-access-token', value: 'refreshed', options: { httpOnly: true } },
      { name: 'sb-refresh-token', value: 'rotated', options: { httpOnly: true } },
    ]);
  });

  it('carries on where cookies are read-only, as they are in a server component', async () => {
    jar.readOnly = true;
    await createClient();

    expect(() =>
      built[0].cookies.setAll([{ name: 'sb-access-token', value: 'refreshed' }]),
    ).not.toThrow();
    expect(jar.written).toEqual([]);
  });

  it('refuses to build against a project with no publishable key', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    await expect(createClient()).rejects.toThrow();
    expect(built).toEqual([]);
  });
});
