#!/usr/bin/env node
/** Creates the Supaphone demo people, puts them in one organization, and loads the sample corpus. */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const API_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:55321';
const SERVICE_KEY = process.env.SB_SERVICE_ROLE_KEY;

/** Published in the README. Demo accounts only. */
const PASSWORD = 'supabasedemo';

/** The cast from supabase/corpus/COMPANY.md. Jane is first, so the org is hers. */
const PEOPLE = [
  {
    email: 'jane@example.com',
    label: 'Jane',
    role: 'owner',
    spaces: ['Marketing', 'Engineering', 'Finance'],
  },
  { email: 'sam@example.com', label: 'Sam', role: 'member', spaces: ['Engineering'] },
  { email: 'ben@example.com', label: 'Ben', role: 'member', spaces: ['Marketing', 'Engineering'] },
  { email: 'maya@example.com', label: 'Maya', role: 'member', spaces: ['Marketing'] },
  { email: 'priya@example.com', label: 'Priya', role: 'member', spaces: ['Marketing'] },
  { email: 'john@example.com', label: 'John', role: 'member', spaces: ['Engineering', 'Finance'] },
  { email: 'dana@example.com', label: 'Dana', role: 'member', spaces: ['Finance'] },
];

/** Every shared space besides the org space, which the signup trigger already made. */
const TEAM_SPACES = ['Marketing', 'Engineering', 'Finance'];

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

  // Only "already registered" falls through to the lookup. Other errors are raised as themselves.
  if (!isAlreadyRegistered(error)) {
    throw new Error(`could not create ${person.email}: ${error.message}`);
  }

  const existing = await findByEmail(client, person.email);
  if (!existing) {
    throw new Error(
      `${person.email} is registered but is not in the first pages of the directory. ` +
        'Reset the local database, or delete the account by hand.',
    );
  }
  return { ...person, id: existing.id, created: false };
}

/** GoTrue reports an existing address by code on newer versions and by message on older ones. */
function isAlreadyRegistered(error) {
  return (
    error.code === 'email_exists' ||
    error.status === 422 ||
    /already (been )?registered|already exists/i.test(error.message ?? '')
  );
}

/** The admin API has no get-by-email, so this pages through the listing to find the id. */
async function findByEmail(client, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`could not read the user directory: ${error.message}`);

    const found = data.users.find((user) => user.email === email);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/** Everyone joins the first person's organization. Their own auto-created ones are left alone. */
async function joinOrganization(client, orgId, person) {
  await client
    .from('org_members')
    .upsert(
      { org_id: orgId, user_id: person.id, role: person.role },
      { onConflict: 'org_id,user_id' },
    );
}

/** The org space is created by the trigger as Everyone. The corpus calls it Company. */
async function renameOrgSpace(client, orgId) {
  await client.from('spaces').update({ name: 'Company' }).eq('org_id', orgId).eq('kind', 'org');
}

/** One team space by name, created once and reused on a second run. */
async function ensureTeamSpace(client, orgId, name) {
  const { data: existing } = await client
    .from('spaces')
    .select('id')
    .eq('org_id', orgId)
    .eq('kind', 'team')
    .eq('name', name)
    .maybeSingle();

  if (existing) return existing.id;

  const { data, error } = await client
    .from('spaces')
    .insert({ org_id: orgId, kind: 'team', name })
    .select('id')
    .single();

  if (error) throw new Error(`could not create the ${name} space: ${error.message}`);
  return data.id;
}

/** Membership is what decides who can read what. Nothing else in this product does. */
async function ensureTeamSpaces(client, orgId, people) {
  const byName = {};
  for (const name of TEAM_SPACES) byName[name] = await ensureTeamSpace(client, orgId, name);

  for (const person of people) {
    for (const name of person.spaces) {
      await client
        .from('space_members')
        .upsert({ space_id: byName[name], user_id: person.id }, { onConflict: 'space_id,user_id' });
    }
  }

  return byName;
}

async function main() {
  const client = db();

  const people = [];
  for (const person of PEOPLE) people.push(await ensurePerson(client, person));

  // Jane's own organization, made by the signup trigger. Taking the oldest one instead would
  // load Supaphone into whatever organization already happened to be in the database.
  const [jane] = people;
  const { data: membership } = await client
    .from('org_members')
    .select('org_id')
    .eq('user_id', jane.id)
    .eq('role', 'owner')
    .limit(1);

  const orgId = membership?.[0]?.org_id;
  if (!orgId) {
    throw new Error(`${jane.email} owns no organization, so the signup trigger did not fire`);
  }

  const { data: orgs } = await client
    .from('organizations')
    .select('id, slug')
    .eq('id', orgId)
    .limit(1);

  const org = orgs?.[0];
  if (!org) throw new Error('the organization the trigger made has gone missing');

  for (const person of people) await joinOrganization(client, org.id, person);
  await renameOrgSpace(client, org.id);
  await ensureTeamSpaces(client, org.id, people);

  console.log(`org      ${org.slug}`);
  for (const person of people) {
    console.log(
      `${person.label.padEnd(6)} ${person.email.padEnd(20)} Company, ${person.spaces.join(', ')}`,
    );
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
