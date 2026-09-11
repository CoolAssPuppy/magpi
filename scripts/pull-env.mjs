#!/usr/bin/env node
/**
 * Updates web/.env.local from Doppler in place: values change, comments and order do not, and a
 * key Doppler has never heard of stays.
 *
 * It used to be a redirect that replaced the whole file, so pulling cost you every local-only
 * setting and the habit became editing the file by hand instead. That is how a key from another
 * project ended up in it. There is no longer a reason to hand-edit.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fromLocalStack, isSameToken, STACK_KEYS } from './lib/local-stack.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'web/.env.local');

function fromDoppler() {
  const child = spawnSync('doppler', ['secrets', 'download', '--no-file', '--format', 'json'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (child.status !== 0) {
    console.error('doppler could not be read. Run `doppler login` and `doppler setup` first.');
    process.exit(1);
  }
  return JSON.parse(child.stdout);
}

function main() {
  const doppler = fromDoppler();
  const incoming = new Map(
    Object.entries(doppler)
      .filter(([key]) => !key.startsWith('DOPPLER_'))
      .map(([key, value]) => [key, String(value)]),
  );

  // The stack's own keys are local facts. Doppler's copies belong to the hosted project.
  const local = fromLocalStack(ROOT);
  if (local) for (const [key, value] of Object.entries(local)) incoming.set(key, value);
  else for (const key of STACK_KEYS) incoming.delete(key);

  const before = existsSync(OUT) ? readFileSync(OUT, 'utf8').split('\n') : [];
  const seen = new Set();
  const changed = [];

  const lines = before.map((line) => {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) return line;

    const [, key, was] = match;
    seen.add(key);
    if (!incoming.has(key)) return line;

    const value = incoming.get(key);
    const before = was.replace(/^"(.*)"$/, '$1');
    // A freshly minted token that does the same job as the one already there is not a change.
    if (before === value || isSameToken(before, value)) return line;

    changed.push(key);
    return `${key}="${value.replace(/\n/g, '\\n')}"`;
  });

  const added = [...incoming.keys()].filter((key) => !seen.has(key));
  for (const key of added) lines.push(`${key}="${incoming.get(key).replace(/\n/g, '\\n')}"`);

  writeFileSync(OUT, `${lines.join('\n').replace(/\n+$/, '')}\n`, { mode: 0o600 });

  console.log(`web/.env.local: ${changed.length} changed, ${added.length} added`);
  if (changed.length > 0) console.log(`  changed: ${changed.join(', ')}`);
  if (added.length > 0) console.log(`  added: ${added.join(', ')}`);
  if (!local) console.log('  the local stack is not running, so its own keys were left alone');
}

main();
