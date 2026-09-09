import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type BrowserClientArgs = { readonly url: string; readonly key: string };

const built: BrowserClientArgs[] = [];

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: (url: string, key: string) => {
    built.push({ url, key });
    return {};
  },
}));

const { createClient } = await import('./client');

const configured = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  serviceRoleKey: process.env.SB_SERVICE_ROLE_KEY,
};

beforeEach(() => {
  built.length = 0;
});

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = configured.url;
});

describe('the browser client', () => {
  it('talks to the configured project with the publishable key', () => {
    createClient();

    expect(built).toEqual([{ url: configured.url, key: configured.publishableKey }]);
  });

  it('never carries the service role key into a browser bundle', () => {
    createClient();

    expect(built[0].key).not.toBe(configured.serviceRoleKey);
  });

  it('refuses to build against a project that was never configured', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    expect(() => createClient()).toThrow();
    expect(built).toEqual([]);
  });
});
