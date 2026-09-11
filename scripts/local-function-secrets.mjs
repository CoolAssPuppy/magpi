#!/usr/bin/env node
/** Writes edge function secrets to a gitignored file when Doppler is unavailable. */

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Local facts beat shared secrets: Doppler's copies of these belong to the hosted project.
import { fromLocalStack, isSameToken } from './lib/local-stack.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'supabase/.env.local');

/** Local stack defaults. Both of these are public in supabase/config.toml. */
const LOCAL_DEFAULTS = {
  SB_SUPABASE_URL: 'http://127.0.0.1:55321',
  SB_TOKEN_ENC_KEY_ID: '1',
};

/** AES-256-GCM key for stored tokens. Generated once per machine and reused so old rows decrypt. */
function localEncryptionKey() {
  if (existsSync(OUT)) {
    const existing = /^SB_TOKEN_ENC_KEY=(.+)$/m.exec(readFileSync(OUT, 'utf8'));
    if (existing) return existing[1];
  }
  return randomBytes(32).toString('base64');
}

function fromDoppler() {
  const child = spawnSync('doppler', ['secrets', 'download', '--no-file', '--format', 'json'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (child.status !== 0) return null;
  try {
    return JSON.parse(child.stdout);
  } catch {
    return null;
  }
}

/** What the file already holds, which is the floor: this script never drops a key. */
function existing() {
  if (!existsSync(OUT)) return {};

  const values = {};
  for (const line of readFileSync(OUT, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) values[match[1]] = match[2];
  }
  return values;
}

function main() {
  const was = existing();
  const doppler = fromDoppler();
  const local = fromLocalStack(ROOT);

  // Start from what is there. An unreachable Doppler leaves every secret it authored in place
  // rather than replacing the file with defaults, which is how a run with no network used to
  // take the OpenAI key and four sets of OAuth credentials out with it.
  const merged = {
    ...LOCAL_DEFAULTS,
    ...was,
    SB_TOKEN_ENC_KEY: localEncryptionKey(),
    ...(doppler ?? {}),
    ...(local ?? {}),
  };

  // Keep a token that still does its job rather than minting a second one that says the same
  // thing: ES256 signatures differ every time, and rewriting them churns both env files.
  for (const key of Object.keys(local ?? {})) {
    if (was[key] && isSameToken(was[key], merged[key])) merged[key] = was[key];
  }

  const lines = Object.entries(merged)
    .filter(([key]) => !key.startsWith('DOPPLER_'))
    .map(([key, value]) => `${key}=${String(value).replace(/\n/g, '\\n')}`)
    .sort();

  writeFileSync(OUT, `${lines.join('\n')}\n`, { mode: 0o600 });

  const kept = Object.keys(was).length;
  console.log(`wrote ${OUT} (${lines.length} keys)`);
  if (!doppler) console.log(`  doppler is unreachable, so ${kept} key(s) already there were kept`);
  if (!local) console.log('  the local stack is not running, so its own keys were left alone');
}

main();
