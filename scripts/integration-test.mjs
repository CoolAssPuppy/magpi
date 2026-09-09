#!/usr/bin/env node
/**
 * Integration tests: real local Supabase, real HTTP, no browser.
 *
 * Run separately from the browser suites. Concurrent fixtures against one
 * persistent local database produce false cleanup failures, so this runner
 * refuses to start if a Playwright run is already holding the stack.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

  const child = spawnSync(
    'npx',
    ['vitest', 'run', '--root', ROOT, '--config', 'vitest.integration.mts'],
    { cwd: ROOT, stdio: 'inherit', env: process.env },
  );

  if (child.status !== 0) {
    console.error('\nintegration FAILED');
    process.exit(1);
  }

  console.log('\nintegration passed');
}

await main();
