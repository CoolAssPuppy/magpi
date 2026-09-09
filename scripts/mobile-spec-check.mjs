#!/usr/bin/env node
/**
 * Keeps docs/mobile-spec.md honest about three things it can be wrong about
 * mechanically.
 *
 * 1. A route under web/app/(app)/ with no entry in the spec.
 * 2. An entry missing one of the fourteen fields, or naming a route that no
 *    longer exists.
 * 3. A repository path cited anywhere in the file that is not on disk.
 *
 * The third one is the reason this script grew. The spec named web/lib/strings/
 * as the string catalog for months, every entry cited keys from it, and the
 * module was never written. A route check cannot see that. Everything else in an
 * entry, the copy and the state design, is checked by a person reading it.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = resolve(ROOT, 'web/app/(app)');
const SPEC = resolve(ROOT, 'docs/mobile-spec.md');

/** In the order an entry states them. A field out of order is as wrong as a missing one. */
const REQUIRED_FIELDS = [
  'Screen name',
  'Web route',
  'Deep link',
  'Data contract',
  'Loading',
  'Empty',
  'Error',
  'Content',
  'Navigation',
  'Components',
  'Proposed string keys',
  'Permissions',
  'Offline and refresh',
  'Proposed analytics events',
];

/** A backticked token starting with one of these is a claim about a file on disk. */
const PATH_PREFIXES = [
  'web/',
  'supabase/',
  'scripts/',
  'docs/',
  'tests/',
  '.github/',
  'components/',
];

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

/** One entry per `### ` heading under `## Entries`. */
function collectEntries(spec) {
  const start = spec.indexOf('\n## Entries');
  if (start === -1) return [];
  return spec
    .slice(start)
    .split('\n### ')
    .slice(1)
    .map((block) => ({
      name: block.slice(0, block.indexOf('\n')).trim(),
      fields: [...block.matchAll(/^- \*\*([^*]+)\.\*\*/gm)].map((match) => match[1]),
      route: block.match(/^- \*\*Web route\.\*\* `([^`]+)`/m)?.[1] ?? null,
    }));
}

/**
 * Trims a citation down to the path it names: a `:12` or `:12-23` line
 * reference, a trailing slash, and a `/*` glob all mean the same file or
 * directory.
 */
function toPath(citation) {
  return citation
    .replace(/:\d+(-\d+)?$/, '')
    .replace(/\/\*$/, '')
    .replace(/\/$/, '');
}

function citedPaths(spec) {
  const cited = new Set();
  for (const [, token] of spec.matchAll(/`([^`\n]+)`/g)) {
    if (!PATH_PREFIXES.some((prefix) => token.startsWith(prefix))) continue;
    if (/\s/.test(token)) continue;
    cited.add(token);
  }
  return [...cited].sort();
}

/** A path under web/ may be cited from the web app's own root, as components/chat/*. */
function pathExists(path) {
  return existsSync(resolve(ROOT, path)) || existsSync(resolve(ROOT, 'web', path));
}

function main() {
  // Deliberately not wrapped. Renaming web/app/(app) used to turn this step
  // into a pass printing "no (app) routes yet", so the one check that keeps the
  // mobile spec honest went quiet at the exact moment the routes moved.
  const routes = [...new Set(collectRoutes(APP_DIR))].sort();

  if (routes.length === 0) {
    console.error(`mobile-spec FAILED: ${APP_DIR} holds no routes`);
    process.exit(1);
  }

  const spec = readFileSync(SPEC, 'utf8');
  const entries = collectEntries(spec);
  const failures = [];

  for (const route of routes) {
    if (!spec.includes(`\`${route}\``)) {
      failures.push(
        `route with no entry: ${route}. Every screen added to web gets one in the same commit.`,
      );
    }
  }

  for (const entry of entries) {
    const missing = REQUIRED_FIELDS.filter((field) => !entry.fields.includes(field));
    if (missing.length > 0) {
      failures.push(`entry "${entry.name}" is missing: ${missing.join(', ')}`);
    }
    const order = entry.fields.filter((field) => REQUIRED_FIELDS.includes(field));
    if (missing.length === 0 && order.join('|') !== REQUIRED_FIELDS.join('|')) {
      failures.push(`entry "${entry.name}" states its fields out of order`);
    }
    if (entry.route && !routes.includes(entry.route)) {
      failures.push(
        `entry "${entry.name}" claims route ${entry.route}, which has no page under web/app/(app)/`,
      );
    }
  }

  for (const citation of citedPaths(spec)) {
    if (!pathExists(toPath(citation))) {
      failures.push(`cited path does not exist: ${citation}`);
    }
  }

  if (failures.length > 0) {
    console.error('mobile-spec FAILED\n');
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      '\nThe spec is a contract. A claim in it that the code does not support is a bug in the file.',
    );
    process.exit(1);
  }

  console.log(
    `mobile-spec: ${routes.length} route(s), ${entries.length} entr(ies), ${citedPaths(spec).length} cited path(s), all check out`,
  );
}

main();
