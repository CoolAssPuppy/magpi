#!/usr/bin/env node
/**
 * Records what every Notifier page draws, so the web previews can be asserted
 * against the device rather than against a reading of it.
 *
 * The device pages and the web previews draw the same layout in two languages
 * and will drift. This runs the Python pages against a recording screen for a
 * fixed set of fixture payloads and writes the result to
 * web/tests/fixtures/preview-fixtures.json. Change a device layout, run
 * `pnpm previews:fixtures`, and the web suite fails until the preview catches
 * up. `--check` fails on a stale file.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const NOTIFIER = join(root, "device/notifier-app");
const TARGET = join(root, "web/tests/fixtures/preview-fixtures.json");

function record() {
  const result = spawnSync("python3", ["-m", "tools.record_previews"], {
    cwd: NOTIFIER,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    process.stderr.write("Recording the page previews failed.\n");
    process.exit(1);
  }
  return `${JSON.stringify(JSON.parse(result.stdout), null, 2)}\n`;
}

/** @param {string} path */
function readOrNull(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function main() {
  const isCheck = process.argv.includes("--check");
  const recorded = record();
  if (readOrNull(TARGET) === recorded) return;

  if (isCheck) {
    process.stderr.write(
      `${relative(root, TARGET)} is stale.\n` +
        "Run `pnpm previews:fixtures` and commit the result.\n",
    );
    process.exit(1);
  }

  mkdirSync(dirname(TARGET), { recursive: true });
  writeFileSync(TARGET, recorded);
  process.stdout.write(`wrote ${relative(root, TARGET)}\n`);
}

main();
