#!/usr/bin/env node
/**
 * One source for the numbers the badge draws at, the caps the server enforces,
 * and the limits the previews respect. Edits go in device-constants.json; this
 * emits a native module per toolchain. `--check` fails on a stale file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(root, "device-constants.json");

const HEADER_LINES = [
  "Generated from device-constants.json. Do not edit by hand: edit the JSON",
  "and run `node scripts/gen-device-constants.mjs`.",
];

const TARGET_PATHS = [
  "device/badge-sdk/sb/constants.py",
  "web/lib/badge-constants.ts",
  "api/supabase/functions/_shared/badge-constants.ts",
];

/**
 * @param {Record<string, unknown>} constants
 * @returns {Record<string, number | boolean | string[]>}
 */
export function validate(constants) {
  for (const [key, value] of Object.entries(constants)) {
    if (typeof value === "boolean") continue;
    if (typeof value === "number") {
      if (!Number.isInteger(value)) {
        throw new Error(`device-constants.json: ${key} must be an integer, got ${value}`);
      }
      continue;
    }
    if (Array.isArray(value)) {
      if (!value.every((item) => typeof item === "string")) {
        throw new Error(`device-constants.json: ${key} must hold only strings`);
      }
      continue;
    }
    throw new Error(`device-constants.json: ${key} has an unsupported value`);
  }
  return /** @type {Record<string, number | boolean | string[]>} */ (constants);
}

/** @param {number | boolean | string[]} value */
function pythonLiteral(value) {
  if (typeof value === "boolean") return value ? "True" : "False";
  if (Array.isArray(value)) {
    const items = value.map((item) => JSON.stringify(item)).join(", ");
    return value.length === 1 ? `(${items},)` : `(${items})`;
  }
  return String(value);
}

/** @param {number | boolean | string[]} value */
function typeScriptLiteral(value) {
  if (Array.isArray(value)) return `${JSON.stringify(value).replaceAll(",", ", ")} as const`;
  return String(value);
}

/** @param {Record<string, number | boolean | string[]>} constants */
export function renderPython(constants) {
  const header = HEADER_LINES.map((line) => `# ${line}`).join("\n");
  const body = Object.entries(constants)
    .map(([key, value]) => `${key} = ${pythonLiteral(value)}`)
    .join("\n");
  return `${header}\n\n${body}\n`;
}

/** @param {Record<string, number | boolean | string[]>} constants */
export function renderTypeScript(constants) {
  const header = HEADER_LINES.map((line) => `// ${line}`).join("\n");
  const body = Object.entries(constants)
    .map(([key, value]) => `export const ${key} = ${typeScriptLiteral(value)};`)
    .join("\n");
  return `${header}\n\n${body}\n`;
}

/** @param {Record<string, number | boolean | string[]>} constants */
function targets(constants) {
  const python = renderPython(constants);
  const typeScript = renderTypeScript(constants);
  return TARGET_PATHS.map((path) => ({
    path: join(root, path),
    content: path.endsWith(".py") ? python : typeScript,
  }));
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
  const constants = validate(JSON.parse(readFileSync(SOURCE, "utf8")));
  const stale = [];

  for (const target of targets(constants)) {
    const current = readOrNull(target.path);
    if (current === target.content) continue;
    if (isCheck) {
      stale.push(relative(root, target.path));
    } else {
      writeFileSync(target.path, target.content);
      process.stdout.write(`wrote ${relative(root, target.path)}\n`);
    }
  }

  if (stale.length) {
    process.stderr.write(
      `device constants are stale:\n${stale.map((path) => `  ${path}`).join("\n")}\n` +
        "Run `pnpm constants` and commit the result.\n",
    );
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
