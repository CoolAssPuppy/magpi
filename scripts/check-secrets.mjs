#!/usr/bin/env node
/**
 * Fails when the two local env files disagree about a secret, or when either has drifted from
 * Doppler. Doppler is the only place a credential is authored; these files are copies of it, and
 * a copy that has been hand-edited is how a key from another project ends up billing this one.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOCAL_ONLY } from './lib/local-stack.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Both copies, and what writes each one, so a failure can say how to fix it. */
const COPIES = [
  { path: 'web/.env.local', written: 'pnpm env:pull' },
  { path: 'supabase/.env.local', written: 'node scripts/local-function-secrets.mjs' },
];

/** `KEY=value` and `KEY="value"` both, since the two writers quote differently. */
function readEnv(path) {
  const full = resolve(ROOT, path);
  if (!existsSync(full)) return null;

  const values = new Map();
  for (const line of readFileSync(full, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    values.set(match[1], match[2].replace(/^"(.*)"$/, '$1'));
  }
  return values;
}

/** What Doppler holds, or null when it is not installed or not logged in. */
function readDoppler() {
  const child = spawnSync('doppler', ['secrets', 'download', '--no-file', '--format', 'json'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (child.status !== 0) return null;

  try {
    return new Map(Object.entries(JSON.parse(child.stdout)));
  } catch {
    return null;
  }
}

/** Enough of a secret to tell two apart, and not enough to be worth reading over a shoulder. */
function fingerprint(value) {
  if (value.length <= 12) return `${value.slice(0, 2)}…`;
  return `${value.slice(0, 8)}…${value.slice(-4)} (${value.length} chars)`;
}

function main() {
  const files = COPIES.map((copy) => ({ ...copy, values: readEnv(copy.path) }));
  const present = files.filter((file) => file.values !== null);
  if (present.length === 0) {
    console.log('secrets: neither env file is here, nothing to compare');
    return;
  }

  const failures = [];

  // Every key the two copies share has to hold the same value in both.
  if (present.length === 2) {
    const [web, functions] = present;
    for (const [key, value] of web.values) {
      if (LOCAL_ONLY.has(key)) continue;
      const other = functions.values.get(key);
      if (other !== undefined && other !== value) {
        failures.push(
          `${key} differs between the two copies\n` +
            `      ${web.path}: ${fingerprint(value)}\n` +
            `      ${functions.path}: ${fingerprint(other)}`,
        );
      }
    }
  }

  const doppler = readDoppler();
  if (doppler) {
    for (const file of present) {
      for (const [key, value] of file.values) {
        if (LOCAL_ONLY.has(key)) continue;
        const authored = doppler.get(key);
        if (authored !== undefined && authored !== value) {
          failures.push(
            `${key} in ${file.path} is not what Doppler holds\n` +
              `      file:    ${fingerprint(value)}\n` +
              `      Doppler: ${fingerprint(authored)}\n` +
              `      rewrite it with: ${file.written}`,
          );
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error(`secrets FAILED: ${failures.length} value(s) drifted\n`);
    for (const failure of failures) console.error(`  ${failure}\n`);
    console.error('Doppler is where a credential is authored. These files are copies of it.');
    process.exit(1);
  }

  const checked = present.map((file) => file.path).join(', ');
  console.log(
    doppler
      ? `secrets: ${checked} agree with each other and with Doppler`
      : `secrets: ${checked} agree with each other (Doppler not reachable, so unchecked)`,
  );
}

main();
