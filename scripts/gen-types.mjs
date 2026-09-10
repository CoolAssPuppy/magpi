#!/usr/bin/env node
/** Regenerates web/lib/database.types.ts from the local database. */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Paths resolve from the repo root so this runs correctly from any cwd.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'web/lib/database.types.ts');

const out = execFileSync(
  'supabase',
  ['gen', 'types', 'typescript', '--local', '--schema', 'public'],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
);

writeFileSync(OUT, out);
console.log(`wrote ${OUT.replace(`${ROOT}/`, '')} (${out.split('\n').length} lines)`);
