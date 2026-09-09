#!/usr/bin/env node
/** Regenerates web/lib/database.types.ts from the local database. */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolved from the repo root like every other script here. It was a relative
// path, so running this from anywhere but the root wrote the file to the wrong
// place or threw, and `supabase` was invoked with the wrong cwd.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'web/lib/database.types.ts');

const out = execFileSync(
  'supabase',
  ['gen', 'types', 'typescript', '--local', '--schema', 'public'],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
);

writeFileSync(OUT, out);
console.log(`wrote ${OUT.replace(`${ROOT}/`, '')} (${out.split('\n').length} lines)`);
