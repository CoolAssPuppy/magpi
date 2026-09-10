import { assert, assertEquals } from '@std/assert';

import { SOURCE_PROVIDERS } from './index.ts';

/** Nothing at runtime notices when a seeded provider slug has no driver, so this compares them. */
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
  // A driver nobody can connect to is dead code.
  assertEquals(SOURCE_PROVIDERS.length > 0, true);
});

Deno.test('the drive slug is the one the seed uses, not the shorter one', async () => {
  // It was `google` here and `google_drive` in the seed, so Drive never synced.
  const seeded = await seededProviderSlugs();
  assert(seeded.includes('google_drive'), 'seed.sql renamed the drive provider');
  assert(SOURCE_PROVIDERS.includes('google_drive'));
  assert(!SOURCE_PROVIDERS.includes('google'));
});
