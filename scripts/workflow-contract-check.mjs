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

/** Commands that need a database, a browser or a native toolchain. */
const HEAVY_COMMANDS = [
  'supabase start',
  'supabase db',
  'supabase test',
  'playwright',
  'test:e2e',
  'test:integration',
  'test:db',
  'pnpm gate',
  'xcodebuild',
  'gradlew',
  'emulator',
];

const HOSTED_RUNNERS_ALLOWED = ['ubuntu-latest', 'ubuntu-24.04', 'ubuntu-22.04'];
const NATIVE_RUNNER_PREFIXES = ['macos', 'windows'];

function readWorkflows() {
  return readdirSync(WORKFLOWS)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => ({ file: f, text: readFileSync(join(WORKFLOWS, f), 'utf8') }));
}

/** Triggers that fire without a person asking for it. */
function automaticTriggers(text) {
  const onBlock = text.split(/^jobs:/m)[0];
  return ['push', 'pull_request', 'schedule'].filter((t) =>
    new RegExp(`^\\s{2}${t}:`, 'm').test(onBlock),
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

    for (const command of HEAVY_COMMANDS) {
      if (text.includes(command)) {
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
