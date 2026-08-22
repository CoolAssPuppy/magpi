import { createServer } from "node:net";

/**
 * Returns the first free port at or after `preferred`.
 *
 * Deliberately bounded and deterministic rather than asking the OS for any
 * free port: Supabase auth redirects and the CORS allowlist have to name the
 * origin ahead of time, so the set of ports this app can land on must be
 * small and known. Anything outside PORT_RANGE would be rejected on the
 * auth callback with a confusing error.
 */
export const BASE_PORT = 3001;
export const PORT_RANGE = 4; // 3001 through 3004

function isFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    // Bind on all interfaces: a server already bound to 0.0.0.0 would not
    // conflict with a 127.0.0.1-only probe, and we would hand back a port
    // that is not actually usable.
    server.listen(port, "0.0.0.0");
  });
}

export async function pickPort(preferred = BASE_PORT, range = PORT_RANGE) {
  for (let port = preferred; port < preferred + range; port++) {
    if (await isFree(port)) return port;
  }
  throw new Error(
    `No free port in ${preferred}..${preferred + range - 1}. ` +
      `Stop whatever is holding them, or pass PORT explicitly.`,
  );
}
