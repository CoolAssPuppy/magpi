#!/usr/bin/env node
/**
 * Statement coverage for the Python suites, measured with coverage.py.
 *
 * coverage.py wraps the test invocation, never the code under test. Nothing
 * under device/ imports it, and `pnpm device:test` still runs on the bare
 * system interpreter.
 *
 * Each suite is measured separately: their roots are different directories
 * with overlapping module names, so one combined data file would attribute
 * lines to the wrong tree.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEVICE_SUITES, DISCOVER, MEASURED_SUITES, OMIT } from "./device-suites.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const python = join(root, ".venv/bin/python");
const THRESHOLD = 95;

const VENV_HELP =
  "Create it with:\n" +
  "  python3 -m venv .venv\n" +
  "  .venv/bin/pip install -r requirements-dev.txt\n";

if (!existsSync(python)) {
  process.stderr.write(`.venv is missing. ${VENV_HELP}`);
  process.exit(2);
}

if (spawnSync(python, ["-c", "import coverage"], { stdio: "ignore" }).status !== 0) {
  process.stderr.write(`coverage.py is not installed in .venv. ${VENV_HELP}`);
  process.exit(2);
}

let hasFailure = false;
for (const suite of MEASURED_SUITES) {
  process.stdout.write(`\n   ${suite}\n`);
  const cwd = join(root, suite);
  const env = { ...process.env, COVERAGE_FILE: join(mkdtempSync(join(tmpdir(), "cov-")), "d") };
  const run = spawnSync(
    python,
    ["-m", "coverage", "run", "--source=.", `--omit=${OMIT.join(",")}`, ...DISCOVER],
    { cwd, env, stdio: "inherit" },
  );
  if (run.status !== 0) hasFailure = true;
  const report = spawnSync(
    python,
    ["-m", "coverage", "report", "-m", `--fail-under=${THRESHOLD}`],
    { cwd, env, stdio: "inherit" },
  );
  if (report.status !== 0) hasFailure = true;
}

process.exit(hasFailure ? 1 : 0);
