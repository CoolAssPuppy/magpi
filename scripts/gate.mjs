#!/usr/bin/env node
/**
 * The gate. Two of them, deliberately separate.
 *
 *   node scripts/gate.mjs --light   format, lint, typecheck, unit tests, build
 *   node scripts/gate.mjs           the light gate plus the database, integration
 *                                   and browser suites, coverage, and the
 *                                   mobile-spec contract
 *
 * A gate that quietly ran nothing reads exactly like a gate that passed, so every
 * step that could not run is reported by name. `--strict` refuses to skip one.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = new Set(process.argv.slice(2));
const isLight = args.has('--light');
const isStrict = args.has('--strict');

const LIGHT_STEPS = [
  { name: 'format check (web)', cmd: 'pnpm', argv: ['format:check'] },
  {
    name: 'format check (functions)',
    cmd: 'pnpm',
    argv: ['format:check:functions'],
    needs: 'deno',
  },
  { name: 'lint (web)', cmd: 'pnpm', argv: ['lint:web'] },
  { name: 'lint (functions)', cmd: 'pnpm', argv: ['lint:functions'], needs: 'deno' },
  { name: 'typecheck (web)', cmd: 'pnpm', argv: ['typecheck:web'] },
  { name: 'typecheck (functions)', cmd: 'pnpm', argv: ['typecheck:functions'], needs: 'deno' },
  { name: 'web unit tests', cmd: 'pnpm', argv: ['test'] },
  { name: 'function unit tests', cmd: 'pnpm', argv: ['test:functions'], needs: 'deno' },
  { name: 'workflow contract', cmd: 'node', argv: ['scripts/workflow-contract-check.mjs'] },
  { name: 'raw color', cmd: 'node', argv: ['scripts/check-raw-color.mjs'] },
  { name: 'web build', cmd: 'pnpm', argv: ['build'] },
];

const FULL_STEPS = [
  { name: 'mobile-spec contract', cmd: 'node', argv: ['scripts/mobile-spec-check.mjs'] },
  { name: 'coverage thresholds', cmd: 'pnpm', argv: ['test:coverage'] },
  { name: 'pgTAP', cmd: 'node', argv: ['scripts/db-test.mjs'], needs: 'supabase' },
  { name: 'integration', cmd: 'node', argv: ['scripts/integration-test.mjs'], needs: 'supabase' },
  { name: 'e2e and lifecycle', cmd: 'pnpm', argv: ['test:e2e'], needs: 'playwright' },
];

function hasBinary(bin) {
  return spawnSync('which', [bin], { encoding: 'utf8' }).status === 0;
}

function isAvailable(need) {
  if (!need) return true;
  if (need === 'deno') return hasBinary('deno');
  if (need === 'supabase') return hasBinary('supabase');
  if (need === 'playwright') return existsSync(resolve(ROOT, 'playwright.config.ts'));
  return true;
}

function run(step) {
  const started = Date.now();
  const child = spawnSync(step.cmd, step.argv, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  return { ok: child.status === 0, seconds, code: child.status };
}

function main() {
  const steps = isLight ? LIGHT_STEPS : [...LIGHT_STEPS, ...FULL_STEPS];
  const label = isLight ? 'light gate' : 'full gate';

  console.log(`\n${label}: ${steps.length} steps${isStrict ? ', strict' : ''}\n`);

  const results = [];
  for (const step of steps) {
    if (!isAvailable(step.needs)) {
      if (isStrict) {
        console.error(`\n${label} FAILED: ${step.name} needs ${step.needs}, which is not here`);
        process.exit(1);
      }
      results.push({ name: step.name, state: 'skipped', reason: `${step.needs} not available` });
      continue;
    }

    console.log(`\n--- ${step.name}`);
    const outcome = run(step);
    results.push({
      name: step.name,
      state: outcome.ok ? 'passed' : 'failed',
      seconds: outcome.seconds,
    });

    if (!outcome.ok) break;
  }

  const failed = results.filter((r) => r.state === 'failed');
  const skipped = results.filter((r) => r.state === 'skipped');
  const notRun = steps.length - results.length;

  console.log(`\n${label} summary`);
  for (const r of results) {
    const suffix = r.state === 'skipped' ? `  (${r.reason})` : `  ${r.seconds}s`;
    console.log(`  ${r.state.padEnd(8)} ${r.name}${suffix}`);
  }
  if (notRun > 0) console.log(`  ${'not run'.padEnd(8)} ${notRun} step(s) after the first failure`);

  if (failed.length > 0) {
    console.error(`\n${label} FAILED at ${failed[0].name}`);
    process.exit(1);
  }

  if (skipped.length > 0) {
    console.log(`\n${label} passed, ${skipped.length} step(s) skipped by name above`);
  } else {
    console.log(`\n${label} passed, nothing skipped`);
  }
}

main();
