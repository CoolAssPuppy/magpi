#!/usr/bin/env node
/** Integration tests on local Supabase. Will not start while a browser suite holds the lock. */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { releaseStackLock, takeStackLock } from '../tests/stack-lock.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SUITE = resolve(ROOT, 'tests/integration');

const API_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:55321';

async function stackIsUp() {
  try {
    const response = await fetch(`${API_URL}/rest/v1/`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '' },
      signal: AbortSignal.timeout(3000),
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function main() {
  if (!existsSync(SUITE)) {
    console.error('no integration suite at tests/integration');
    process.exit(1);
  }

  if (!(await stackIsUp())) {
    console.error(
      `local Supabase is not answering at ${API_URL}.\n` +
        'Run `supabase start` first. Another project may be holding the ports.',
    );
    process.exit(1);
  }

  const held = takeStackLock(ROOT, 'integration');
  if (held) {
    console.error(
      `the ${held.suite} suite is using the local database (pid ${held.pid}).\n` +
        "Fixtures from two suites delete each other's accounts. Wait for it to finish.",
    );
    process.exit(1);
  }

  // Release the lock on every outcome so a failing run does not block the next.
  let child;
  try {
    child = spawnSync(
      'npx',
      ['vitest', 'run', '--root', ROOT, '--config', 'vitest.integration.mts'],
      { cwd: ROOT, stdio: 'inherit', env: process.env },
    );
  } finally {
    releaseStackLock(ROOT);
  }

  if (child.status !== 0) {
    console.error('\nintegration FAILED');
    process.exit(1);
  }

  console.log('\nintegration passed');
}

await main();
