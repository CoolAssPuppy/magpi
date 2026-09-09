import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

type AuthCall = {
  method: string;
  args: readonly unknown[];
};

export type AuthClientOptions = {
  error?: { message: string } | null;
  /**
   * Leaves every call unresolved, which is the only way to look at a form while
   * the auth server is still thinking about it.
   */
  neverResolves?: boolean;
  /**
   * What signUp answers with. A session comes back when the project has email
   * confirmation switched off, which is the Supabase CLI's local default, and
   * means the account is usable immediately rather than waiting on a link.
   */
  session?: { access_token: string } | null;
};

/**
 * Stands in for GoTrue as the browser client exposes it. Every method answers
 * the same way, because each auth form makes exactly one call and reads the
 * error off it, plus the session on signUp.
 */
export function authClient(options: AuthClientOptions = {}): {
  supabase: SupabaseClient<Database>;
  calls: AuthCall[];
} {
  const calls: AuthCall[] = [];
  const error = options.error ?? null;

  const record =
    (method: string) =>
    (...args: readonly unknown[]) => {
      calls.push({ method, args });
      if (options.neverResolves) return new Promise<never>(() => {});
      return Promise.resolve({ data: { session: options.session ?? null }, error });
    };

  const supabase = {
    auth: {
      signInWithPassword: record('signInWithPassword'),
      signInWithOAuth: record('signInWithOAuth'),
      signUp: record('signUp'),
      resetPasswordForEmail: record('resetPasswordForEmail'),
      updateUser: record('updateUser'),
      signOut: record('signOut'),
    },
  } as unknown as SupabaseClient<Database>;

  return { supabase, calls };
}
