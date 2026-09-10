import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

export type AuthServerCall = {
  method: string;
  args: readonly unknown[];
};

/** Stands in for GoTrue. Both auth routes read only the error off the answer. */
export function authServer(error: { message: string } | null = null): {
  supabase: SupabaseClient<Database>;
  calls: AuthServerCall[];
} {
  const calls: AuthServerCall[] = [];

  const record =
    (method: string) =>
    async (...args: readonly unknown[]) => {
      calls.push({ method, args });
      return { error };
    };

  const supabase = {
    auth: {
      verifyOtp: record('verifyOtp'),
      exchangeCodeForSession: record('exchangeCodeForSession'),
    },
  } as unknown as SupabaseClient<Database>;

  return { supabase, calls };
}
