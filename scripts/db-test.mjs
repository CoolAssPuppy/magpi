#!/usr/bin/env node
/**
 * Runs the pgTAP suite in supabase/tests against the local database.
 *
 * `supabase test db` exits 0 on a suite that failed to load, so the output is
 * inspected rather than trusted to the exit code.
 *
 * It looks for the success line rather than a list of failure lines. The list
 * was the bug: it matched `not ok`, `# Looks like you failed` and `FAILED`, and
 * pg_prove says `Result: FAIL`, `Dubious, test returned N` and `Parse errors:`,
 * none of which are in it. A file that aborted before its first assertion
 * therefore passed, which is the same shape as the three failures in
 * docs/lessons.md: an assertion that cannot run and one that cannot fail look
 * identical from the outside.
 *
 * The file count is checked too. A suite that silently stops loading one of its
 * files reports a green run over fewer assertions, and nothing else would say
 * so.
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

  const summary = /^Files=(\d+), Tests=(\d+)/m.exec(output);
  const reasons = [];

  if (child.status !== 0) reasons.push(`supabase test db exited ${child.status}`);
  if (!/^Result:\s*PASS\s*$/m.test(output)) reasons.push('pg_prove did not report Result: PASS');
  if (summary === null) {
    reasons.push('no Files=/Tests= summary line, so nothing says what ran');
  } else {
    const ran = Number(summary[1]);
    const assertions = Number(summary[2]);
    if (ran !== files.length) {
      reasons.push(`${ran} file(s) ran, ${files.length} on disk`);
    }
    if (assertions === 0) reasons.push('the suite ran no assertions at all');
  }

  if (reasons.length > 0) {
    console.error('\npgTAP FAILED');
    for (const reason of reasons) console.error(`  ${reason}`);
    process.exit(1);
  }

  console.log(`\npgTAP passed: ${summary[2]} assertion(s) across ${summary[1]} file(s)`);
}

main();
