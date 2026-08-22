#!/usr/bin/env node
/**
 * The device Python suites.
 *
 * Run on the system interpreter, not a venv: device code has to run on
 * MicroPython, so it is stdlib-only, and a venv full of packages would hide
 * an import that cannot exist on a badge.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEVICE_SUITES, DISCOVER } from "./device-suites.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let hasFailure = false;
for (const cwd of DEVICE_SUITES) {
  process.stdout.write(`\n   ${cwd}\n`);
  const result = spawnSync("python3", DISCOVER, { cwd: join(root, cwd), stdio: "inherit" });
  if (result.status !== 0) hasFailure = true;
}

process.exit(hasFailure ? 1 : 0);
