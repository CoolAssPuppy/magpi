#!/usr/bin/env node
/**
 * Starts the Next dev server on the first free port in the registered range.
 *
 * The port cannot be arbitrary: Supabase auth redirects and the CORS allowlist
 * have to name the origin ahead of time, so every port this can land on is
 * registered in api/supabase/config.toml and in the dashboard's redirect
 * allowlist. Anything outside the range is rejected on the auth callback with
 * a message that does not say why.
 *
 * Honours PORT when it is set, so the pre-push gate can pin its e2e run.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BASE_PORT, PORT_RANGE, pickPort } from "./pick-port.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "web");

const requested = Number(process.env.PORT);
const port = Number.isInteger(requested) && requested > 0 ? requested : await pickPort();

if (port !== BASE_PORT) {
  process.stdout.write(
    `Port ${BASE_PORT} was busy, using ${port}. ` +
      `Registered range is ${BASE_PORT} to ${BASE_PORT + PORT_RANGE - 1}.\n`,
  );
}

const child = spawn("pnpm", ["exec", "next", "dev", "--port", String(port)], {
  cwd: web,
  stdio: "inherit",
  env: { ...process.env, PORT: String(port) },
});

// Forward the signal rather than dying first, so Next tears its own workers
// down and the port is free for the next run.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
