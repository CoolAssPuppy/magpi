import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

type AuthCall = {
  method: string;
  args: readonly unknown[];
};

export type AuthClientOptions = {
  error?: { message: string } | null;
  /** Leaves every call unresolved, so a form can be inspected mid-request. */
  neverResolves?: boolean;
  /** What signUp answers with. A session comes back when email confirmation is switched off. */
  session?: { access_token: string } | null;
};

/** Stands in for GoTrue as the browser client exposes it. Every method answers the same way. */
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
