#!/usr/bin/env node
/**
 * Fails when a route exists under web/app/(app)/ with no entry in
 * docs/mobile-spec.md.
 *
 * Cheap to write, and the only thing that keeps that file honest. Without it the
 * mobile spec drifts within a week and stops being a contract.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = resolve(ROOT, 'web/app/(app)');
const SPEC = resolve(ROOT, 'docs/mobile-spec.md');

/** Route groups and private folders do not appear in a URL. */
function isTransparentSegment(name) {
  return (name.startsWith('(') && name.endsWith(')')) || name.startsWith('_') || name === '@';
}

function collectRoutes(dir, prefix = '') {
  const routes = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) {
      if (entry === 'page.tsx' && prefix !== '') routes.push(prefix);
      continue;
    }
    const next = isTransparentSegment(entry) ? prefix : `${prefix}/${entry}`;
    routes.push(...collectRoutes(full, next));
  }
  if (prefix === '' && readdirSync(dir).includes('page.tsx')) routes.push('/');
  return routes;
}

function main() {
  let routes;
  try {
    routes = [...new Set(collectRoutes(APP_DIR))].sort();
  } catch {
    console.log('mobile-spec: no (app) routes yet');
    return;
  }

  const spec = readFileSync(SPEC, 'utf8');
  const missing = routes.filter((route) => !spec.includes(`\`${route}\``));

  if (missing.length > 0) {
    console.error('mobile-spec FAILED: routes with no entry in docs/mobile-spec.md\n');
    for (const route of missing) console.error(`  ${route}`);
    console.error('\nEvery screen added to web gets an entry in the same commit.');
    process.exit(1);
  }

  console.log(`mobile-spec: ${routes.length} route(s), all documented`);
}

main();
