#!/usr/bin/env node
/**
 * Materialises edge function secrets for a local run when Doppler is unavailable.
 *
 * A restricted sandbox can fail `doppler run` for keyring reasons, which is not
 * proof that Doppler or the token is missing. This is the fallback so a local
 * function invocation still works, and it writes to a gitignored path only.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'supabase/.env.local');

/** Local stack defaults. Every one of these is public in supabase/config.toml. */
const LOCAL_DEFAULTS = {
  SB_SUPABASE_URL: 'http://127.0.0.1:55321',
  SB_TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
  SB_TOKEN_ENC_KEY_ID: '1',
};

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
  }

  const merged = { ...LOCAL_DEFAULTS, ...(doppler ?? {}) };
  const lines = Object.entries(merged)
    .filter(([key]) => !key.startsWith('DOPPLER_'))
    .map(([key, value]) => `${key}=${String(value).replace(/\n/g, '\\n')}`)
    .sort();

  writeFileSync(OUT, `${lines.join('\n')}\n`, { mode: 0o600 });
  console.log(`wrote ${OUT} (${lines.length} keys)${doppler ? '' : ', defaults only'}`);

  if (!existsSync(resolve(ROOT, '.gitignore'))) return;
}

main();
