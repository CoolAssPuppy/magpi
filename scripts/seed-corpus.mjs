#!/usr/bin/env node
/** Loads supabase/corpus into a seeded org: node scripts/seed-corpus.mjs [--org-slug x]. */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS_DIR = join(ROOT, 'supabase/corpus');
const MANIFEST = join(CORPUS_DIR, 'manifest.json');
const BUCKET = 'documents';

/** Team spaces the corpus needs, in the order they are created. */
const TEAM_SPACES = [
  { key: 'engineering', name: 'Engineering' },
  { key: 'leadership', name: 'Leadership' },
];

/** Sources that arrive through a connection rather than a person's browser. */
const SYNCED_SOURCES = new Set(['notion', 'linear', 'slack', 'drive']);

class SeedError extends Error {}

/** Reads `--org-slug` off the command line. Returns null when it is absent. */
function parseOrgSlug(argv) {
  const index = argv.indexOf('--org-slug');
  if (index === -1) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new SeedError('--org-slug needs a value');
  }
  return value;
}

/** Fails loudly rather than writing half a corpus into the wrong place. */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new SeedError(`${name} is not set`);
  return value;
}

/** Throws on a PostgREST error so no caller has to check two things. */
function unwrap(result, what) {
  if (result.error) {
    throw new SeedError(`${what}: ${result.error.message}`);
  }
  return result.data;
}

/** Resolves the target org from `--org-slug`, or the only one that exists. */
async function resolveOrg(db, slug) {
  if (slug) {
    const rows = unwrap(
      await db.from('organizations').select('id, name, slug').eq('slug', slug).limit(1),
      'reading organizations',
    );
    if (rows.length === 0) throw new SeedError(`no organization with slug ${slug}`);
    return rows[0];
  }

  const rows = unwrap(
    await db.from('organizations').select('id, name, slug').order('created_at').limit(2),
    'reading organizations',
  );
  if (rows.length === 0) throw new SeedError('no organizations exist, seed one first');
  if (rows.length > 1) {
    throw new SeedError('more than one organization exists, pass --org-slug');
  }
  return rows[0];
}

/** The org members, oldest first. The first two own the personal spaces. */
async function resolveMembers(db, orgId) {
  const rows = unwrap(
    await db
      .from('org_members')
      .select('user_id, role, created_at')
      .eq('org_id', orgId)
      .order('created_at'),
    'reading org members',
  );
  if (rows.length < 2) {
    throw new SeedError(`org needs at least two members for the corpus, found ${rows.length}`);
  }
  return rows;
}

/** Finds a space by a filter, or creates it. Returns its id either way. */
async function findOrCreateSpace(db, { orgId, kind, name, ownerUserId }) {
  let query = db.from('spaces').select('id').eq('org_id', orgId).eq('kind', kind);
  query = ownerUserId ? query.eq('owner_user_id', ownerUserId) : query.eq('name', name);

  const existing = unwrap(await query.limit(1), `reading ${kind} space`);
  if (existing.length > 0) return existing[0].id;

  const created = unwrap(
    await db
      .from('spaces')
      .insert({ org_id: orgId, kind, name, owner_user_id: ownerUserId ?? null })
      .select('id')
      .single(),
    `creating ${kind} space ${name}`,
  );
  return created.id;
}

/** Space membership is additive here. Running twice adds nobody twice. */
async function addSpaceMembers(db, spaceId, userIds) {
  const rows = userIds.map((userId) => ({ space_id: spaceId, user_id: userId }));
  const result = await db.from('space_members').upsert(rows, { onConflict: 'space_id,user_id' });
  if (result.error) {
    throw new SeedError(`adding space members: ${result.error.message}`);
  }
}

/** Maps manifest `space` values to space ids, creating the team and personal spaces. */
async function resolveSpaces(db, orgId, members) {
  const spaces = {};

  const orgSpace = unwrap(
    await db.from('spaces').select('id').eq('org_id', orgId).eq('kind', 'org').limit(1),
    'reading org space',
  );
  if (orgSpace.length === 0) throw new SeedError('org has no org space');
  spaces.everyone = orgSpace[0].id;

  for (const team of TEAM_SPACES) {
    spaces[team.key] = await findOrCreateSpace(db, { orgId, kind: 'team', name: team.name });
  }

  // Both members in engineering, the first member alone in leadership.
  await addSpaceMembers(
    db,
    spaces.engineering,
    members.slice(0, 2).map((m) => m.user_id),
  );
  await addSpaceMembers(db, spaces.leadership, [members[0].user_id]);

  const personalKeys = ['personal-a', 'personal-b'];
  for (const [index, key] of personalKeys.entries()) {
    const userId = members[index].user_id;
    spaces[key] = await findOrCreateSpace(db, {
      orgId,
      kind: 'personal',
      name: 'Personal',
      ownerUserId: userId,
    });
    await addSpaceMembers(db, spaces[key], [userId]);
  }

  return spaces;
}

/** Reads the documents bucket definition out of `supabase/config.toml`. */
function bucketConfig() {
  const toml = readFileSync(resolve(ROOT, 'supabase/config.toml'), 'utf8');
  const table = toml.split(`[storage.buckets.${BUCKET}]`)[1];
  if (!table) throw new SeedError(`supabase/config.toml has no [storage.buckets.${BUCKET}]`);

  const body = table.split(/\n\[/)[0];
  const limit = body.match(/file_size_limit\s*=\s*"([^"]+)"/)?.[1];
  const mimeBlock = body.match(/allowed_mime_types\s*=\s*\[([^\]]*)\]/)?.[1] ?? '';

  if (!limit) throw new SeedError('the documents bucket has no file_size_limit');

  return {
    // The storage API accepts MB, GB and KB, and rejects the MiB spelling config.toml uses.
    fileSizeLimit: limit.replace(/MiB$/, 'MB').replace(/GiB$/, 'GB').replace(/KiB$/, 'KB'),
    allowedMimeTypes: [...mimeBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]),
  };
}

/** Creates the bucket when the running stack predates its config.toml entry. */
async function ensureBucket(db) {
  const { data } = await db.storage.getBucket(BUCKET);
  if (data) return false;

  const { error } = await db.storage.createBucket(BUCKET, {
    public: false,
    ...bucketConfig(),
  });
  if (error && !/already exists/i.test(error.message)) {
    throw new SeedError(`creating the ${BUCKET} bucket: ${error.message}`);
  }
  return true;
}

/** Puts the document bytes where the ingest worker can fetch them. */
async function uploadBody(db, storagePath, body) {
  const result = await db.storage.from(BUCKET).upload(storagePath, body, {
    contentType: 'text/markdown',
    upsert: true,
  });
  if (result.error) {
    throw new SeedError(`uploading ${storagePath}: ${result.error.message}`);
  }
}

/** Writes one manifest entry. Returns 'created' or 'skipped'. */
async function loadEntry(db, { entry, orgId, spaceId }) {
  const existing = unwrap(
    await db
      .from('documents')
      .select('id')
      .eq('org_id', orgId)
      .eq('space_id', spaceId)
      .eq('external_id', entry.externalId)
      .limit(1),
    `reading document ${entry.externalId}`,
  );
  if (existing.length > 0) return 'skipped';

  const body = readFileSync(join(CORPUS_DIR, entry.path), 'utf8');
  const storagePath = `${orgId}/corpus/${entry.path}`;
  await uploadBody(db, storagePath, body);

  const document = unwrap(
    await db
      .from('documents')
      .insert({
        org_id: orgId,
        space_id: spaceId,
        external_id: entry.externalId,
        title: entry.title,
        url: entry.url,
        mime_type: 'text/markdown',
        storage_path: storagePath,
        content_hash: createHash('sha256').update(body).digest('hex'),
        origin: SYNCED_SOURCES.has(entry.source) ? 'sync' : 'upload',
        updated_at: entry.updatedAt,
      })
      .select('id')
      .single(),
    `inserting document ${entry.path}`,
  );

  unwrap(
    await db
      .from('ingest_jobs')
      .insert({
        org_id: orgId,
        space_id: spaceId,
        document_id: document.id,
        stage: 'fetch',
        status: 'queued',
      })
      .select('id')
      .single(),
    `queueing ingest for ${entry.path}`,
  );

  return 'created';
}

async function main() {
  const slug = parseOrgSlug(process.argv.slice(2));
  const db = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SB_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );

  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  if (await ensureBucket(db)) console.log(`created the ${BUCKET} storage bucket`);
  const org = await resolveOrg(db, slug);
  const members = await resolveMembers(db, org.id);
  const spaces = await resolveSpaces(db, org.id, members);

  console.log(`org ${org.name} (${org.slug})`);
  console.log(`members ${members.length}, spaces ${Object.keys(spaces).length}`);

  const counts = { created: 0, skipped: 0 };
  const perSpace = {};
  for (const entry of manifest) {
    const spaceId = spaces[entry.space];
    if (!spaceId)
      throw new SeedError(`manifest entry ${entry.path} names unknown space ${entry.space}`);
    const outcome = await loadEntry(db, { entry, orgId: org.id, spaceId });
    counts[outcome] += 1;
    perSpace[entry.space] = (perSpace[entry.space] ?? 0) + 1;
  }

  console.log(`documents created ${counts.created}, already present ${counts.skipped}`);
  for (const [space, total] of Object.entries(perSpace)) {
    console.log(`  ${space}: ${total}`);
  }
}

main().catch((error) => {
  if (error instanceof SeedError) {
    console.error(`seed-corpus: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
