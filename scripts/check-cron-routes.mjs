#!/usr/bin/env node
/**
 * Fails when a cron path in vercel.json does not resolve to a route handler.
 *
 * Three of them pointed at nothing for the whole build. A deployed cron hitting
 * a 404 logs a failed invocation nobody reads, so ingest, sync and dreaming
 * would have been silently dead in production while every test passed. Nothing
 * else in the gate looks at vercel.json at all.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function handlerFor(path) {
  const segments = path.replace(/^\/+/, '').split('/');
  return resolve(ROOT, 'web/app', ...segments, 'route.ts');
}

function main() {
  const config = JSON.parse(readFileSync(resolve(ROOT, 'vercel.json'), 'utf8'));
  const crons = config.crons ?? [];

  if (crons.length === 0) {
    console.log('cron routes: none declared');
    return;
  }

  const missing = crons.filter((cron) => !existsSync(handlerFor(cron.path)));

  if (missing.length > 0) {
    console.error(`cron routes FAILED: ${missing.length} path(s) resolve to no handler\n`);
    for (const cron of missing) {
      console.error(`  ${cron.path}  expected ${handlerFor(cron.path).replace(`${ROOT}/`, '')}`);
    }
    console.error('\nA scheduled path with no handler is a 404 nobody reads.');
    process.exit(1);
  }

  console.log(`cron routes: ${crons.length} path(s), all resolve`);
}

main();
