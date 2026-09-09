#!/usr/bin/env node
/** Regenerates web/lib/database.types.ts from the local database. */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const out = execFileSync(
  'supabase',
  ['gen', 'types', 'typescript', '--local', '--schema', 'public'],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
);

writeFileSync('web/lib/database.types.ts', out);
console.log(`wrote web/lib/database.types.ts (${out.split('\n').length} lines)`);
