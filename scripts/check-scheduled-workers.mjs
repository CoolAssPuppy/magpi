#!/usr/bin/env node
/**
 * Fails when a scheduled worker names a function that does not exist.
 *
 * The schedule lives in `supabase/schemas/96_schedules.sql` as three
 * `cron.schedule` calls naming an Edge Function each. Renaming or deleting a
 * function directory leaves the schedule pointing at nothing, and the tick then
 * fails inside pg_net where nobody is reading.
 *
 * This replaced a check that read `vercel.json`, from when the schedule was
 * three Vercel crons. That file has no crons now, so the old check passed
 * whatever anyone did to the workers.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEDULES = 'supabase/schemas/96_schedules.sql';
const VERCEL = 'vercel.json';

function scheduledWorkers(source) {
  return [...source.matchAll(/cron\.schedule\(\s*'([a-z0-9-]+)'/g)].map((match) => match[1]);
}

function main() {
  const source = readFileSync(resolve(ROOT, SCHEDULES), 'utf8');
  const workers = scheduledWorkers(source);

  if (workers.length === 0) {
    console.error(`scheduled workers FAILED: ${SCHEDULES} schedules nothing`);
    process.exit(1);
  }

  const missing = workers.filter(
    (worker) => !existsSync(resolve(ROOT, 'supabase/functions', worker, 'index.ts')),
  );

  if (missing.length > 0) {
    console.error(`scheduled workers FAILED: ${missing.length} named function(s) do not exist\n`);
    for (const worker of missing) {
      console.error(`  ${worker}  expected supabase/functions/${worker}/index.ts`);
    }
    process.exit(1);
  }

  // The schedule moved into the database. A cron here would be a second one.
  const vercel = JSON.parse(readFileSync(resolve(ROOT, VERCEL), 'utf8'));
  if ((vercel.crons ?? []).length > 0) {
    console.error(`scheduled workers FAILED: ${VERCEL} declares crons as well`);
    console.error('Two schedulers for the same workers means every job runs twice.');
    process.exit(1);
  }

  console.log(`scheduled workers: ${workers.length}, all present (${workers.join(', ')})`);
}

main();
