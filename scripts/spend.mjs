#!/usr/bin/env node
/**
 * What this project has spent on models, from `model_calls`.
 *
 * Every model call writes a row there with its purpose, model and token counts, so the number
 * already exists. Nothing read it, which is how an evening of benchmarking emptied an account
 * while the evidence sat in a table nobody opened. `supabase db reset` drops that table, so run
 * this before a reset if the history matters.
 *
 *   node scripts/spend.mjs            the last 24 hours
 *   node scripts/spend.mjs --all      everything the table still holds
 *   node scripts/spend.mjs --hours 3  a window of your choosing
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIMITS = resolve(ROOT, 'docs/limits.md');

/**
 * Prices come from the table in docs/limits.md rather than a copy here. That page says it is the
 * one place these are written down, and a second copy is a second thing to forget.
 */
function prices() {
  const rows = new Map();
  for (const line of readFileSync(LIMITS, 'utf8').split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    if (cells.length < 8) continue;

    const model = /^`([a-z0-9.-]+)`$/.exec(cells[2])?.[1];
    if (!model) continue;

    const money = (cell) => (cell === 'not applicable' ? 0 : Number(cell.replace(/[^0-9.]/g, '')));
    const input = money(cells[6]);
    if (!Number.isFinite(input)) continue;
    rows.set(model, { input, output: money(cells[7]) || 0 });
  }

  if (rows.size === 0) {
    console.error(`no price rows parsed from ${LIMITS}. Has the Models table changed shape?`);
    process.exit(1);
  }
  return rows;
}

function databaseUrl() {
  const child = spawnSync('supabase', ['status', '-o', 'json'], { cwd: ROOT, encoding: 'utf8' });
  if (child.status !== 0) {
    console.error('the local stack is not running, so there is nothing to read');
    process.exit(1);
  }
  return JSON.parse(child.stdout).DB_URL;
}

function query(url, sql) {
  const child = spawnSync('psql', [url, '-At', '-F', '\t', '-c', sql], { encoding: 'utf8' });
  if (child.status !== 0) {
    console.error(child.stderr.trim());
    process.exit(1);
  }
  return child.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'));
}

function window() {
  const args = process.argv.slice(2);
  if (args.includes('--all')) return { clause: 'true', label: 'everything the table still holds' };

  const at = args.indexOf('--hours');
  const hours = at >= 0 ? Number(args[at + 1]) : 24;
  if (!Number.isFinite(hours) || hours <= 0) {
    console.error('--hours takes a positive number');
    process.exit(1);
  }
  return {
    clause: `occurred_at > now() - interval '${hours} hours'`,
    label: `the last ${hours} hour${hours === 1 ? '' : 's'}`,
  };
}

function money(amount) {
  return amount >= 0.01 ? `$${amount.toFixed(2)}` : `$${amount.toFixed(4)}`;
}

function main() {
  const rate = prices();
  const { clause, label } = window();
  const url = databaseUrl();

  const rows = query(
    url,
    `select purpose, model, count(*), sum(input_tokens), sum(output_tokens)
     from public.model_calls where ${clause}
     group by purpose, model order by sum(input_tokens) desc`,
  );

  if (rows.length === 0) {
    console.log(`no model calls in ${label}`);
    return;
  }

  console.log(`model spend, ${label}\n`);
  console.log('  purpose     model                      calls        in       out      cost');

  let total = 0;
  const unpriced = new Set();

  for (const [purpose, model, calls, input, output] of rows) {
    const price = rate.get(model);
    if (!price) unpriced.add(model);

    const cost = price ? (Number(input) * price.input + Number(output) * price.output) / 1e6 : 0;
    total += cost;

    console.log(
      `  ${purpose.padEnd(11)} ${model.padEnd(26)} ${calls.padStart(5)} ` +
        `${Number(input).toLocaleString().padStart(9)} ${Number(output).toLocaleString().padStart(9)} ` +
        `${(price ? money(cost) : 'no price').padStart(9)}`,
    );
  }

  console.log(`\n  total ${money(total)}`);
  for (const model of unpriced) {
    console.log(`  ${model} has no row in docs/limits.md, so it is not in that total`);
  }
}

main();
