#!/usr/bin/env node
/**
 * Keeps the hosted gate small.
 *
 * Inspects runner types, commands and triggers rather than job names. Job names
 * alone are not enough, and counting YAML job ids misses matrix expansion, which
 * is exactly how a five-minute workflow becomes a forty-minute one.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS = resolve(ROOT, '.github/workflows');

/**
 * Commands that need a database, a browser or a native toolchain.
 *
 * Both the pnpm script name and the path it runs. The list held only the script
 * names, and this repo invokes every one of them by path: light-gate.yml runs
 * `node scripts/gate.mjs --light`, so a workflow changed to `node
 * scripts/gate.mjs` would have started the database, installed browsers and
 * passed this check.
 */
const HEAVY_COMMANDS = [
  'supabase start',
  'supabase db',
  'supabase test',
  'playwright',
  'test:e2e',
  'test:integration',
  'test:db',
  'pnpm gate',
  'scripts/gate.mjs',
  'scripts/db-test.mjs',
  'scripts/integration-test.mjs',
  'xcodebuild',
  'gradlew',
  'emulator',
];

/** The one heavy invocation the hosted gate is allowed to make. */
const LIGHT_GATE = 'scripts/gate.mjs --light';

const HOSTED_RUNNERS_ALLOWED = ['ubuntu-latest', 'ubuntu-24.04', 'ubuntu-22.04'];
const NATIVE_RUNNER_PREFIXES = ['macos', 'windows'];

function readWorkflows() {
  return readdirSync(WORKFLOWS)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => ({ file: f, text: readFileSync(join(WORKFLOWS, f), 'utf8') }));
}

/**
 * Triggers that fire without a person asking for it.
 *
 * The indent is not assumed. Requiring exactly two spaces meant `on: [push,
 * pull_request]`, `on: push`, and any file indented four spaces all reported no
 * automatic triggers, and the caller skipped the whole file. A check that reads
 * a workflow it does not understand as safe is worse than no check.
 */
function automaticTriggers(text) {
  const onBlock = text.split(/^jobs:/m)[0];
  return ['push', 'pull_request', 'schedule'].filter(
    (trigger) =>
      // Block form at any indent: `  push:`
      new RegExp(`^\\s+${trigger}:`, 'm').test(onBlock) ||
      // Flow form: `on: [push, pull_request]` or `on: push`
      new RegExp(`^on:.*(\\[|\\s)${trigger}\\b`, 'm').test(onBlock),
  );
}

function runsOn(text) {
  return [...text.matchAll(/runs-on:\s*(\S+)/g)].map((m) => m[1].replace(/['"]/g, ''));
}

function hasMatrix(text) {
  return /^\s*strategy:/m.test(text) && /^\s*matrix:/m.test(text);
}

function main() {
  const failures = [];

  for (const { file, text } of readWorkflows()) {
    const automatic = automaticTriggers(text);
    if (automatic.length === 0) continue;

    // The light gate names the same script as the full one, so its own
    // invocation is removed before the list is applied.
    const withoutLightGate = text.split(LIGHT_GATE).join('');

    for (const command of HEAVY_COMMANDS) {
      if (withoutLightGate.includes(command)) {
        failures.push(`${file}: runs \`${command}\` on ${automatic.join(', ')}`);
      }
    }

    for (const runner of runsOn(text)) {
      if (NATIVE_RUNNER_PREFIXES.some((p) => runner.startsWith(p))) {
        failures.push(`${file}: native runner ${runner} on ${automatic.join(', ')}`);
      } else if (!HOSTED_RUNNERS_ALLOWED.includes(runner) && !runner.startsWith('${{')) {
        failures.push(`${file}: unexpected runner ${runner}`);
      }
    }

    if (hasMatrix(text)) {
      failures.push(`${file}: matrix expansion on ${automatic.join(', ')}`);
    }
  }

  if (failures.length > 0) {
    console.error('workflow contract FAILED\n');
    for (const f of failures) console.error(`  ${f}`);
    console.error('\nHosted triggers run the light gate only. Full suites are manual.');
    process.exit(1);
  }

  console.log('workflow contract: hosted triggers stay light');
}

main();
