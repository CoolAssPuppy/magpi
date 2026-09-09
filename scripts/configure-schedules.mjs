#!/usr/bin/env node
/**
 * Points the database's scheduled workers at this environment.
 *
 * `supabase/schemas/96_schedules.sql` holds the schedule and reads two Vault
 * secrets at fire time. A database with neither set ticks and does nothing, so
 * this is what turns the schedule on.
 *
 * Run it after `supabase start` for a local stack. For a hosted project, set
 * the same two secrets once in the SQL editor.
 */

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';

/**
 * The gateway as the database container sees it. 127.0.0.1 inside Postgres is
 * Postgres, so the local URL the web app uses is not the one pg_net can reach.
 */
const LOCAL_BASE = 'http://host.docker.internal:55321';

function setSecret(name, value) {
  // Deleted and recreated rather than updated: vault.create_secret refuses a
  // duplicate name, and this script is meant to be safe to run twice.
  const sql = `
    delete from vault.secrets where name = ${literal(name)};
    select vault.create_secret(${literal(value)}, ${literal(name)});
  `;
  execFileSync('psql', [DB_URL, '-q', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

function literal(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function main() {
  const base = process.env.WORKER_BASE_URL ?? LOCAL_BASE;
  const key = process.env.SB_SERVICE_ROLE_KEY;

  if (!key) {
    console.error('SB_SERVICE_ROLE_KEY is not set. Run this under `doppler run --`.');
    process.exit(1);
  }

  setSecret('worker_base_url', base);
  setSecret('worker_service_key', key);

  console.log(`scheduled workers now call ${base}`);
  console.log('cron.job holds the schedule; the key stays in Vault');
}

main();
