import { assert, assertEquals } from '@std/assert';

import { SOURCE_PROVIDERS } from './index.ts';

/**
 * The `providers` table is the authority on what a provider is called, and the
 * drivers are keyed by the same slug. Nothing at runtime notices when the two
 * disagree: `driverFor` throws unknown_provider, the sync worker skips the
 * connection as having no driver, and the source silently never syncs.
 *
 * This reads the seed as text for the same reason models_test reads the web
 * app's model file: two artifacts in different languages have to agree, and the
 * only thing that can enforce it is a test that reads one and compares.
 */
const SEED = new URL('../../../seed.sql', import.meta.url);

/** The slug of every provider row the seed inserts as enabled. */
async function seededProviderSlugs(): Promise<string[]> {
  const sql = await Deno.readTextFile(SEED);
  const insert = /insert\s+into\s+public\.providers[\s\S]*?;/i.exec(sql);
  assert(insert, 'seed.sql no longer inserts into public.providers');

  // The slug is the first column of each values tuple.
  const slugs = [...insert[0].matchAll(/\(\s*'([a-z0-9_-]+)'\s*,/gi)].map((match) => match[1]);
  assert(slugs.length > 0, 'no provider slugs were parsed out of seed.sql');
  return slugs;
}

Deno.test('every seeded provider has a driver under the same slug', async () => {
  const seeded = await seededProviderSlugs();
  for (const slug of seeded) {
    assert(
      SOURCE_PROVIDERS.includes(slug),
      `seed.sql has provider "${slug}" and no driver is registered under that slug`,
    );
  }
});

Deno.test('every driver has a provider row to be reached through', () => {
  // A driver nobody can connect to is dead code, and the connections page
  // renders from the table.
  assertEquals(SOURCE_PROVIDERS.length > 0, true);
});

Deno.test('the drive slug is the one the seed uses, not the shorter one', async () => {
  // It was `google` here and `google_drive` in the seed, so Drive never synced.
  const seeded = await seededProviderSlugs();
  assert(seeded.includes('google_drive'), 'seed.sql renamed the drive provider');
  assert(SOURCE_PROVIDERS.includes('google_drive'));
  assert(!SOURCE_PROVIDERS.includes('google'));
});
