#!/usr/bin/env node
/** Writes edge function secrets to a gitignored file when Doppler is unavailable. */

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

function main() {
  const doppler = fromDoppler();
  if (!doppler) {
    console.warn('doppler unavailable, writing local defaults only');
    console.warn('the token encryption key is generated for this machine, not shared with anyone');
  }

  const merged = {
    ...LOCAL_DEFAULTS,
    SB_TOKEN_ENC_KEY: localEncryptionKey(),
    ...(doppler ?? {}),
  };
  const lines = Object.entries(merged)
    .filter(([key]) => !key.startsWith('DOPPLER_'))
    .map(([key, value]) => `${key}=${String(value).replace(/\n/g, '\\n')}`)
    .sort();

  writeFileSync(OUT, `${lines.join('\n')}\n`, { mode: 0o600 });
  console.log(`wrote ${OUT} (${lines.length} keys)${doppler ? '' : ', defaults only'}`);
}

main();
