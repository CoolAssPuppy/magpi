import { afterEach, describe, expect, it } from 'vitest';

import { publicEnv, serverEnv } from './env';

type Environment = {
  readonly NEXT_PUBLIC_SUPABASE_URL: string | undefined;
  readonly NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string | undefined;
  readonly SB_SERVICE_ROLE_KEY: string | undefined;
  readonly OPENAI_API_KEY: string | undefined;
};

function environment(overrides: Partial<Environment> = {}): Environment {
  return {
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55321',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc',
    SB_SERVICE_ROLE_KEY: 'sb_secret_abc',
    OPENAI_API_KEY: 'sk-abc',
    ...overrides,
  };
}

function apply(env: Environment): void {
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

const asFound = environment({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  SB_SERVICE_ROLE_KEY: process.env.SB_SERVICE_ROLE_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
});

afterEach(() => {
  apply(asFound);
});

describe('the browser configuration', () => {
  it('reads the project a Supabase client should talk to', () => {
    apply(environment());

    expect(publicEnv()).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55321',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc',
    });
  });

  it('needs none of the server secrets, because the browser never gets them', () => {
    apply(environment({ SB_SERVICE_ROLE_KEY: undefined, OPENAI_API_KEY: undefined }));

    expect(() => publicEnv()).not.toThrow();
  });

  it('refuses to run with no Supabase project configured', () => {
    apply(environment({ NEXT_PUBLIC_SUPABASE_URL: undefined }));

    expect(() => publicEnv()).toThrow();
  });

  it('refuses a project address that is not a url', () => {
    apply(environment({ NEXT_PUBLIC_SUPABASE_URL: '127.0.0.1:55321' }));

    expect(() => publicEnv()).toThrow();
  });

  it('refuses a blank publishable key', () => {
    apply(environment({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' }));

    expect(() => publicEnv()).toThrow();
  });
});

describe('the server configuration', () => {
  it('reads the secrets only server code holds', () => {
    apply(environment());

    expect(serverEnv()).toEqual({
      SB_SERVICE_ROLE_KEY: 'sb_secret_abc',
      OPENAI_API_KEY: 'sk-abc',
    });
  });

  it('refuses to run without the service role key', () => {
    apply(environment({ SB_SERVICE_ROLE_KEY: undefined }));

    expect(() => serverEnv()).toThrow();
  });

  it('refuses a blank OpenAI key rather than failing at the first model call', () => {
    apply(environment({ OPENAI_API_KEY: '' }));

    expect(() => serverEnv()).toThrow();
  });
});
