#!/usr/bin/env node
/**
 * Materialises edge function secrets for a local run when Doppler is unavailable.
 *
 * A restricted sandbox can fail `doppler run` for keyring reasons, which is not
 * proof that Doppler or the token is missing. This is the fallback so a local
 * function invocation still works, and it writes to a gitignored path only.
 */

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

/**
 * The AES-256-GCM key provider tokens are encrypted under at rest.
 *
 * This used to be `Buffer.alloc(32, 7)`, a constant sitting in a public repo,
 * written whenever `doppler secrets download` exited non-zero. A wrong token or
 * a dropped network connection was enough, and the only sign was one line on
 * stderr. Every OAuth token stored on that machine was then readable by anyone
 * with the database and a copy of this file.
 *
 * A key is generated once per machine and reused from the file afterwards, so
 * connections made yesterday still decrypt today. Reused rather than
 * regenerated for that reason: a fresh key each run turns every stored token
 * into an undecryptable blob and the failure looks like a provider problem.
 */
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
