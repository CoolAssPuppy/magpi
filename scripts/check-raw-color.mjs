#!/usr/bin/env node
/**
 * Fails on a color that did not come from the Supabase token system.
 *
 * Two things are rejected. A raw hex or rgb() literal in our own source, and a
 * Tailwind default palette class such as `bg-slate-800`, which resolves to a
 * value the Supabase themes never see and so breaks in one theme or the other.
 *
 * The vendored token files under web/styles/supabase are exempt. They are
 * upstream's, they are where the literals are supposed to live, and they are
 * never hand-edited.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SCAN_ROOTS = ['web/app', 'web/components', 'web/hooks', 'web/lib', 'web/styles'];
const SCAN_EXTENSIONS = ['.ts', '.tsx', '.css'];

const EXEMPT_PATHS = [
  'web/styles/supabase/',
  'web/lib/database.types.ts',
  // The token file is where our own overrides are declared, and docs/design.md
  // records a justification for each one.
  'web/styles/tokens.css',
];

/** Tailwind's default palette. Supabase supplies its own scales through Radix. */
const TAILWIND_PALETTE = [
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
];

const UTILITY_PREFIXES = [
  'bg',
  'text',
  'border',
  'ring',
  'fill',
  'stroke',
  'from',
  'via',
  'to',
  'shadow',
  'outline',
  'decoration',
  'divide',
  'accent',
  'caret',
  'placeholder',
];

const RULES = [
  {
    name: 'raw hex',
    // A hex color, not an id selector or a hash in a url.
    pattern:
      /(?<![\w&#])#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b(?![\w-])/g,
  },
  {
    name: 'raw rgb or hsl',
    pattern: /\b(?:rgba?|hsla?)\(\s*\d/g,
  },
  {
    name: 'tailwind default palette class',
    pattern: new RegExp(
      `\\b(?:${UTILITY_PREFIXES.join('|')})-(?:${TAILWIND_PALETTE.join('|')})-(?:50|\\d{3})\\b`,
      'g',
    ),
  },
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      yield full;
    }
  }
}

function isExempt(relativePath) {
  return EXEMPT_PATHS.some((p) => relativePath.startsWith(p));
}

function main() {
  const findings = [];

  for (const scanRoot of SCAN_ROOTS) {
    const dir = resolve(ROOT, scanRoot);

    // Deliberately not wrapped. A scan root that has been renamed used to make
    // this step skip that whole tree and report success, so the check would
    // have gone quiet exactly when the code moved out from under it.
    const files = [...walk(dir)];

    for (const file of files) {
      const relativePath = relative(ROOT, file);
      if (isExempt(relativePath)) continue;

      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        for (const rule of RULES) {
          rule.pattern.lastIndex = 0;
          // Every match on the line, not the first. `exec` returned one, so a
          // class list carrying two raw colors was reported once and the
          // printed count was short by the difference.
          for (const match of line.matchAll(rule.pattern)) {
            findings.push({
              file: relativePath,
              line: index + 1,
              rule: rule.name,
              text: match[0],
            });
          }
        }
      });
    }
  }

  if (findings.length > 0) {
    console.error(`raw color check FAILED: ${findings.length} finding(s)\n`);
    for (const f of findings) {
      console.error(`  ${f.file}:${f.line}  ${f.rule}: ${f.text}`);
    }
    console.error('\nEvery color comes from a Supabase semantic token. See docs/design.md.');
    process.exit(1);
  }

  console.log('raw color check: every color comes from a token');
}

main();
