#!/usr/bin/env node
/**
 * One command from an empty database to a demo you can ask questions of.
 *
 *   doppler run -- node scripts/seed-demo.mjs
 *
 * Creates the two demo people, puts them in one organization, and loads the
 * sample corpus. Idempotent: run it twice and the second run creates nothing.
 *
 * The two people exist because the demo that matters needs two of them. Diane
 * is in Leadership and Sofia is not, and they ask the same question. See
 * docs/corpus.md under "Demo questions and their correct answers".
 */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const API_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:55321';
const SERVICE_KEY = process.env.SB_SERVICE_ROLE_KEY;

/** Published in the README. This is a local demo, not a deployment. */
const PASSWORD = 'magpi-demo-password';

const PEOPLE = [
  { email: 'diane@alderwick.test', label: 'Diane', leadership: true },
  { email: 'sofia@alderwick.test', label: 'Sofia', leadership: false },
];

function db() {
  if (!SERVICE_KEY) {
    console.error('SB_SERVICE_ROLE_KEY is missing. Run under `doppler run --`.');
    process.exit(1);
  }
  return createClient(API_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function ensurePerson(client, person) {
  const { data, error } = await client.auth.admin.createUser({
    email: person.email,
    password: PASSWORD,
    email_confirm: true,
  });

  if (!error) return { ...person, id: data.user.id, created: true };

  // Already there from a previous run. The admin API has no get-by-email, so
  // the listing is the only route to the id.
  const { data: page } = await client.auth.admin.listUsers({ perPage: 1000 });
  const existing = page.users.find((user) => user.email === person.email);
  if (!existing) throw new Error(`could not create or find ${person.email}: ${error.message}`);
  return { ...person, id: existing.id, created: false };
}

/**
 * Everyone lands in the first person's organization. The signup trigger gives
 * each of them their own, and the second one's is left alone rather than
 * deleted: a personal space that belongs to nobody is a worse demo artefact
 * than an empty organization nobody opens.
 */
async function joinOrganization(client, orgId, person) {
  await client
    .from('org_members')
    .upsert(
      { org_id: orgId, user_id: person.id, role: 'member' },
      { onConflict: 'org_id,user_id' },
    );
}

async function ensureLeadership(client, orgId, people) {
  const { data: existing } = await client
    .from('spaces')
    .select('id')
    .eq('org_id', orgId)
    .eq('kind', 'team')
    .eq('name', 'Leadership')
    .maybeSingle();

  const spaceId =
    existing?.id ??
    (
      await client
        .from('spaces')
        .insert({ org_id: orgId, kind: 'team', name: 'Leadership' })
        .select('id')
        .single()
    ).data?.id;

  if (!spaceId) throw new Error('could not create the Leadership space');

  for (const person of people.filter((p) => p.leadership)) {
    await client
      .from('space_members')
      .upsert({ space_id: spaceId, user_id: person.id }, { onConflict: 'space_id,user_id' });
  }

  return spaceId;
}

async function main() {
  const client = db();

  const people = [];
  for (const person of PEOPLE) people.push(await ensurePerson(client, person));

  const { data: orgs } = await client
    .from('organizations')
    .select('id, slug')
    .order('created_at')
    .limit(1);

  const org = orgs?.[0];
  if (!org) throw new Error('no organization exists, which means the signup trigger did not fire');

  for (const person of people) await joinOrganization(client, org.id, person);
  await ensureLeadership(client, org.id, people);

  console.log(`org      ${org.slug}`);
  for (const person of people) {
    const where = person.leadership ? 'Leadership and Everyone' : 'Everyone only';
    console.log(`${person.label.padEnd(8)} ${person.email}  ${where}`);
  }
  console.log(`password ${PASSWORD}\n`);

  const corpus = spawnSync(
    'node',
    [resolve(ROOT, 'scripts/seed-corpus.mjs'), '--org-slug', org.slug],
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    },
  );

  if (corpus.status !== 0) process.exit(corpus.status ?? 1);

  console.log('\nNow run the ingest worker so the documents become answerable:');
  console.log('  supabase functions serve');
  console.log('  curl -X POST http://127.0.0.1:55321/functions/v1/ingest-worker \\');
  console.log('    -H "Authorization: Bearer $SB_SERVICE_ROLE_KEY" -d \'{"batch":25}\'');
}

await main();
