#!/usr/bin/env node
/** Fails when our own code references a shadcn compat alias. */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMPAT = 'web/styles/supabase/packages/ui/build/css/source/compat.css';
const OURS = 'web/styles/tokens.css';
const SEARCHED = ['web/app', 'web/components', 'web/lib', 'web/hooks', 'web/styles/globals.css'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.css']);

function aliasNames(source) {
  // The custom property names compat.css declares.
  return [...source.matchAll(/^\s*(--[a-z0-9-]+):/gim)].map((match) => match[1].slice(2));
}

function filesUnder(path) {
  const full = resolve(ROOT, path);

  // Throws rather than catching, so a renamed path fails instead of scanning nothing.
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
  // Names tokens.css redeclares are not compat dependencies, since tokens.css loads last.
  const ours = new Set(aliasNames(readFileSync(resolve(ROOT, OURS), 'utf8')));
  const aliases = aliasNames(readFileSync(resolve(ROOT, COMPAT), 'utf8')).filter(
    (alias) => !ours.has(alias),
  );
  if (aliases.length === 0) {
    console.log('compat tokens: compat.css declares none, nothing to guard');
    return;
  }

  const found = [];
  for (const file of SEARCHED.flatMap(filesUnder)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const alias of aliases) {
        // Leading hyphen matches var() and Tailwind uses; right bound excludes longer names.
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
