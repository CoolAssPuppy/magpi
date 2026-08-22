#!/usr/bin/env node
/**
 * Pre-push gate. Runs what CI runs, cheapest and most likely to fail first,
 * so a push that would fail CI is caught locally.
 *
 * A step may declare `skipIf`, returning a reason when there is genuinely
 * nothing to run yet. Skips are always printed. `--strict` refuses to skip at
 * all: a gate that quietly ran nothing reads exactly like a gate that passed.
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const GREEN = "\u001b[32m";
const RED = "\u001b[31m";
const DIM = "\u001b[2m";
const RESET = "\u001b[0m";
const TICK = "\u2713";

/**
 * @param {{ e2ePort: number }} options
 * @returns {{ name: string, command: string, skipIf?: (present: Record<string, boolean>) => string | null }[]}
 */
export function buildSteps({ e2ePort }) {
  return [
    { name: "Format", command: "pnpm run format:check" },
    { name: "Device constants", command: "pnpm run constants:check" },
    {
      name: "Preview fixtures",
      command: "pnpm run previews:fixtures:check",
      skipIf: ({ hasPreviewRecorder }) =>
        hasPreviewRecorder ? null : "no recorder at device/notifier-app/tools",
    },
    { name: "Script tests", command: "pnpm run scripts:test" },

    { name: "Web lint", command: "pnpm run web:lint" },
    { name: "Web typecheck", command: "pnpm run web:typecheck" },
    {
      name: "Web unit tests",
      command: "pnpm run web:test",
      skipIf: ({ hasWebTests }) => (hasWebTests ? null : "no specs under web/tests"),
    },

    { name: "API lint", command: "pnpm run api:lint" },
    { name: "API typecheck", command: "pnpm run api:check" },
    { name: "API tests", command: "pnpm run api:test" },

    { name: "Device tests", command: "pnpm run device:test" },

    { name: "Web coverage", command: "pnpm run coverage:web" },
    { name: "API coverage", command: "pnpm run coverage:api" },
    { name: "Device coverage", command: "pnpm run coverage:device" },

    {
      name: "Database tests (pgTAP)",
      command: "pnpm run db:test",
      skipIf: ({ hasMigrations }) =>
        hasMigrations ? null : "no migrations yet (api/supabase/migrations)",
    },

    { name: "Web build", command: "pnpm run web:build" },

    {
      name: "E2E tests",
      command: `E2E_PROD=true PORT=${e2ePort} pnpm run test:e2e`,
      skipIf: ({ hasE2ESpecs }) => (hasE2ESpecs ? null : "no specs in tests/e2e"),
    },
  ];
}

/**
 * @param {ReturnType<typeof buildSteps>} steps
 * @param {Record<string, boolean>} present
 * @param {{ isStrict?: boolean }} [options]
 * @returns {Map<string, string>} step name to skip reason
 */
export function resolveSkips(steps, present, { isStrict = false } = {}) {
  const skips = new Map();
  if (isStrict) return skips;
  for (const step of steps) {
    const reason = step.skipIf?.(present);
    if (reason) skips.set(step.name, reason);
  }
  return skips;
}

/** @param {string} dir @param {RegExp} pattern */
function hasFileMatching(dir, pattern) {
  const path = join(root, dir);
  return existsSync(path) && readdirSync(path, { recursive: true }).some((f) => pattern.test(f));
}

function ensureDependencies() {
  if (existsSync(join(root, "node_modules"))) return;
  process.stdout.write(`${DIM}  Installing dependencies (first run)${RESET}\n`);
  execSync("pnpm install --frozen-lockfile", { stdio: "inherit", cwd: root });
}

async function main() {
  const isStrict = process.argv.includes("--strict");
  const { pickPort } = await import("./pick-port.mjs");
  const steps = buildSteps({ e2ePort: await pickPort() });
  const skips = resolveSkips(
    steps,
    {
      hasMigrations: hasFileMatching("api/supabase/migrations", /\.sql$/),
      hasE2ESpecs: hasFileMatching("tests/e2e", /\.spec\.[tj]s$/),
      hasWebTests: hasFileMatching("web/tests", /\.test\.tsx?$/),
      hasPreviewRecorder: hasFileMatching("device/notifier-app/tools", /record_previews\.py$/),
    },
    { isStrict },
  );

  ensureDependencies();

  const width = Math.max(...steps.map((step) => step.name.length)) + 3;
  const start = Date.now();

  for (const step of steps) {
    const dots = ".".repeat(Math.max(3, width - step.name.length));
    const reason = skips.get(step.name);
    if (reason) {
      process.stdout.write(`  ${step.name} ${DIM}${dots} skipped, ${reason}${RESET}\n`);
      continue;
    }

    process.stdout.write(`  ${step.name} ${DIM}${dots}${RESET} `);
    const stepStart = Date.now();
    try {
      // execSync runs through a shell because the commands use env prefixes
      // and `cd`. Every command is a literal above, so nothing external
      // reaches the shell.
      execSync(step.command, { stdio: "pipe", cwd: root });
    } catch (error) {
      process.stdout.write(`${RED}x${RESET}\n\n`);
      process.stderr.write(error.stdout?.toString() ?? "");
      process.stderr.write(error.stderr?.toString() ?? "");
      process.stderr.write(`\n${RED}${step.name} failed. Push aborted.${RESET}\n`);
      process.exit(1);
    }
    const took = ((Date.now() - stepStart) / 1000).toFixed(1);
    process.stdout.write(`${GREEN}${TICK}${RESET} ${DIM}${took}s${RESET}\n`);
  }

  const seconds = ((Date.now() - start) / 1000).toFixed(0);
  const ran = steps.length - skips.size;
  process.stdout.write(`\n${GREEN}${TICK}${RESET} ${ran} checks passed in ${seconds}s.`);
  process.stdout.write(skips.size ? ` ${skips.size} skipped.\n` : "\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
