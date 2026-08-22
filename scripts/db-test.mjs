#!/usr/bin/env node
/**
 * pgTAP tests and the schema linter against the local Supabase stack.
 *
 * A script rather than a raw `supabase test db` so the gate says the stack is
 * not running instead of printing a CLI error that reads like a failure.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const api = join(root, "api");

if (spawnSync("supabase", ["status"], { cwd: api, stdio: "pipe" }).status !== 0) {
  process.stderr.write("Supabase stack is not running. Start it with `pnpm db:start`.\n");
  process.exit(1);
}

for (const args of [
  ["test", "db"],
  ["db", "lint", "--level", "error"],
]) {
  const result = spawnSync("supabase", args, { cwd: api, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
