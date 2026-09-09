import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * A short explicit run id, so a local run against a persistent database does not
 * collide with a previous signup before the journey reaches the behavior it is
 * testing.
 */
export const RUN_ID = process.env.TEST_RUN_ID ?? Math.random().toString(36).slice(2, 8);

/** Fixed, so nothing in a fixture depends on when the suite runs. */
export const FIXED_DATE = '2026-03-01T09:00:00.000Z';

export const PASSWORD = 'magpi-test-password-1';

export function identity(label: string) {
  return { email: `${label}-${RUN_ID}@magpi.test`, password: PASSWORD };
}

export function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:55321';
  const key = process.env.SB_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SB_SERVICE_ROLE_KEY is required for the e2e fixtures');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Creates a confirmed user directly, so a journey that is not testing signup
 * does not have to walk through the mail inbox to get one.
 */
export async function createConfirmedUser(label: string) {
  const { email, password } = identity(label);
  const service = serviceClient();

  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) throw new Error(`could not create ${email}: ${error.message}`);
  return { email, password, userId: data.user.id };
}

/**
 * Deletes the user and the organization the signup trigger built for them.
 *
 * Deleting an auth user cascades their personal space and their membership rows,
 * and leaves the organization behind because nothing references the user from
 * it. Forty-one orphaned organizations had accumulated on the local database
 * before anyone noticed, each carrying an org space, which moves the planner's
 * estimates for the RLS subquery every content policy runs.
 */
export async function deleteUser(userId: string) {
  const service = serviceClient();

  const { data: memberships } = await service
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId);

  await service.auth.admin.deleteUser(userId);

  for (const membership of memberships ?? []) {
    const { count } = await service
      .from('org_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('org_id', membership.org_id);

    // Only when the last member has gone. A shared organization outlives any one
    // of its people, which is the whole point of the two-user journey.
    if ((count ?? 0) === 0) {
      await service.from('organizations').delete().eq('id', membership.org_id);
    }
  }
}

/** A client acting as one signed-in person, so RLS decides what they see. */
export async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:55321';
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key)
    throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required for the e2e fixtures');

  const client = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`could not sign in ${email}: ${error.message}`);
  return client;
}
