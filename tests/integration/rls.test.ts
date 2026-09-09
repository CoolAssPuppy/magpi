import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const API_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:55321';
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const SERVICE_KEY = process.env.SB_SERVICE_ROLE_KEY ?? '';

const RUN_ID = process.env.TEST_RUN_ID ?? Math.random().toString(36).slice(2, 8);
const PASSWORD = 'recall-integration-password-1';

type Person = { email: string; userId: string; client: SupabaseClient };

function serviceClient() {
  return createClient(API_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createPerson(label: string): Promise<Person> {
  const email = `${label}-${RUN_ID}@recall.test`;
  const service = serviceClient();

  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`could not create ${email}: ${error.message}`);

  const client = createClient(API_URL, PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw new Error(`could not sign in ${email}: ${signInError.message}`);

  return { email, userId: data.user.id, client };
}

describe('a signed-in person, over real HTTP', () => {
  let alice: Person;
  let bob: Person;

  beforeAll(async () => {
    [alice, bob] = await Promise.all([createPerson('alice'), createPerson('bob')]);
  });

  afterAll(async () => {
    const service = serviceClient();
    await service.auth.admin.deleteUser(alice.userId);
    await service.auth.admin.deleteUser(bob.userId);
  });

  it('gets a personal space and an org space from the signup trigger', async () => {
    const { data, error } = await alice.client.from('spaces').select('kind, name');

    expect(error).toBeNull();
    expect(data?.map((row) => row.kind).sort()).toEqual(['org', 'personal']);
  });

  it('sees only its own spaces, and gets no error for the ones it cannot see', async () => {
    const { data: aliceSpaces } = await alice.client.from('spaces').select('id');
    const { data: bobSpaces, error } = await bob.client.from('spaces').select('id');

    const aliceIds = new Set((aliceSpaces ?? []).map((row) => row.id));
    expect(error).toBeNull();
    expect((bobSpaces ?? []).some((row) => aliceIds.has(row.id))).toBe(false);
  });

  it('reads the provider registry', async () => {
    const { data, error } = await alice.client.from('providers').select('slug').order('slug');

    expect(error).toBeNull();
    expect(data?.map((row) => row.slug)).toEqual(['google_drive', 'linear', 'notion', 'slack']);
  });

  it('cannot ask for a provider token, even on a connection it could otherwise read', async () => {
    const { error } = await alice.client.from('connections').select('access_token_enc');

    // PostgREST refuses the column, so the failure is a 403 and not an empty
    // result. An empty result would mean the column was readable and the row
    // was hidden, which is a weaker guarantee.
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });

  it('cannot select every column of connections either', async () => {
    const { error } = await alice.client.from('connections').select('*');
    expect(error).not.toBeNull();
  });

  it('cannot write a chunk, because chunks are service-role only', async () => {
    const { data: spaces } = await alice.client.from('spaces').select('id, org_id').limit(1);
    const space = spaces?.[0];
    expect(space).toBeDefined();
    if (!space) return;

    const { error } = await alice.client.from('chunks').insert({
      org_id: space.org_id,
      space_id: space.id,
      document_id: '00000000-0000-0000-0000-000000000000',
      ordinal: 0,
      content: 'should never land',
    });

    expect(error).not.toBeNull();
  });

  it("cannot spend somebody else's rate limit budget", async () => {
    const { error } = await alice.client.rpc('consume_rate_limit', {
      p_bucket: 'chat:someone-else',
      p_limit: 1,
      p_window_s: 60,
    });

    expect(error).not.toBeNull();
  });
});
