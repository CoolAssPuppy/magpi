#!/usr/bin/env node
/**
 * Runs the pgTAP suite in supabase/tests against the local database.
 *
 * `supabase test db` exits 0 on a suite that failed to load, so the output is
 * inspected for a TAP failure line rather than trusted to the exit code.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TESTS = resolve(ROOT, 'supabase/tests');

function main() {
  const files = readdirSync(TESTS).filter((f) => f.endsWith('.sql'));
  if (files.length === 0) {
    console.error('no pgTAP files in supabase/tests');
    process.exit(1);
  }

  console.log(`pgTAP: ${files.length} file(s)`);

  const child = spawnSync('supabase', ['test', 'db'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });

  const output = `${child.stdout ?? ''}${child.stderr ?? ''}`;
  process.stdout.write(output);

  const failed =
    child.status !== 0 ||
    /^not ok/m.test(output) ||
    /# Looks like you (failed|planned)/m.test(output) ||
    /FAILED/.test(output);

  if (failed) {
    console.error('\npgTAP FAILED');
    process.exit(1);
  }

  console.log('\npgTAP passed');
}

main();
