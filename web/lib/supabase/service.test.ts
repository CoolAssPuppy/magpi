import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

type ServiceClientArgs = {
  readonly url: string;
  readonly key: string;
  readonly options: { readonly auth: { persistSession: boolean; autoRefreshToken: boolean } };
};

const built: ServiceClientArgs[] = [];

vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string, options: ServiceClientArgs['options']) => {
    built.push({ url, key, options });
    return {};
  },
}));

const { createServiceClient } = await import('./service');

const configured = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  serviceRoleKey: process.env.SB_SERVICE_ROLE_KEY,
};

beforeEach(() => {
  built.length = 0;
});

afterEach(() => {
  process.env.SB_SERVICE_ROLE_KEY = configured.serviceRoleKey;
});

describe('the service client', () => {
  it('holds the service role key, which is what lets it write rows a user cannot', () => {
    createServiceClient();

    expect(built[0]).toMatchObject({ url: configured.url, key: configured.serviceRoleKey });
    expect(built[0].key).not.toBe(configured.publishableKey);
  });

  it('keeps no session, so one request cannot act as whoever came before it', () => {
    createServiceClient();

    expect(built[0].options.auth).toEqual({ persistSession: false, autoRefreshToken: false });
  });

  it('refuses to build without the service role key', () => {
    delete process.env.SB_SERVICE_ROLE_KEY;

    expect(() => createServiceClient()).toThrow();
    expect(built).toEqual([]);
  });
});
