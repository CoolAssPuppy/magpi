#!/usr/bin/env node
/**
 * Fails when our own code references a shadcn compat alias.
 *
 * `web/styles/supabase/packages/ui/build/css/source/compat.css` is vendored
 * from upstream and says of itself that nothing new should reference it and
 * that the file goes away once it is empty. The primitives were written
 * against it, so the next `scripts/sync-tokens.mjs` run after upstream deletes
 * it would have unstyled twelve files with no error anywhere.
 *
 * The rewrite is done. This is what stops it coming back: an `npx shadcn add`
 * that overwrites a primitive brings the old names with it, and nothing else
 * in the build would notice.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMPAT = 'web/styles/supabase/packages/ui/build/css/source/compat.css';
const SEARCHED = [
  'web/app',
  'web/components',
  'web/lib',
  'web/hooks',
  'web/styles/globals.css',
  'web/styles/tokens.css',
];
const EXTENSIONS = new Set(['.ts', '.tsx', '.css']);

function aliasNames(source) {
  // The declarations inside compat.css, which are exactly the names it exists
  // to keep resolving. The right-hand side is a semantic token and is fine.
  return [...source.matchAll(/^\s*(--[a-z0-9-]+):/gim)].map((match) => match[1].slice(2));
}

function filesUnder(path) {
  const full = resolve(ROOT, path);

  // Not a try/catch. A configured path that has been renamed makes this check
  // scan nothing and report success, which is the failure mode the audit found
  // in two older gate scripts.
  const entry = statSync(full);
  if (entry.isFile()) return [full];

  return readdirSync(full, { withFileTypes: true }).flatMap((child) => {
    if (child.name === 'node_modules') return [];
    const childPath = join(path, child.name);
    if (child.isDirectory()) return filesUnder(childPath);
    return EXTENSIONS.has(extname(child.name)) ? [resolve(ROOT, childPath)] : [];
  });
}

function main() {
  const aliases = aliasNames(readFileSync(resolve(ROOT, COMPAT), 'utf8'));
  if (aliases.length === 0) {
    console.log('compat tokens: compat.css declares none, nothing to guard');
    return;
  }

  const found = [];
  for (const file of SEARCHED.flatMap(filesUnder)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const alias of aliases) {
        // Preceded by a hyphen, which covers both `var(--foreground-light)`
        // and the Tailwind class `text-foreground-light` that the same token
        // generates. Bounded on the right so `foreground-light` does not also
        // count every use of `foreground-lighter`.
        if (!new RegExp(`-${alias}(?![a-z0-9-])`).test(line)) continue;
        found.push(`${file.replace(`${ROOT}/`, '')}:${index + 1}  ${alias}`);
      }
    });
  }

  if (found.length > 0) {
    console.error(`compat tokens FAILED: ${found.length} reference(s) to a compat alias\n`);
    for (const hit of found.slice(0, 40)) console.error(`  ${hit}`);
    if (found.length > 40) console.error(`  ... and ${found.length - 40} more`);
    console.error(`\n${COMPAT} is vendored and upstream intends to delete it.`);
    process.exit(1);
  }

  console.log(`compat tokens: ${aliases.length} alias(es) declared, none referenced`);
}

main();
