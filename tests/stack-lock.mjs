/**
 * One suite at a time against the persistent local database.
 *
 * Concurrent fixtures create and delete accounts on one database, so a cleanup
 * in one run deletes the organization another run is mid-assertion on, and both
 * fail in ways that read like product bugs. The integration runner's docstring
 * claimed to refuse to start when a browser run held the stack, and nothing
 * enforced it.
 *
 * A file, not a process scan: `pgrep -f playwright` matches the editor, the
 * docs and this comment.
 *
 * The repo root is a parameter rather than derived from `import.meta.url`,
 * because Playwright compiles its global setup to CommonJS and `import.meta`
 * does not survive that. Both callers already know where the root is.
 */

import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lockPath = (root) => resolve(root, 'supabase/.stack-lock');

/** A lock older than this belonged to a run that was killed. */
const STALE_MS = 30 * 60 * 1000;

function heldBy(root) {
  try {
    const held = JSON.parse(readFileSync(lockPath(root), 'utf8'));
    if (Date.now() - held.at > STALE_MS) return null;
    // A dead process cannot be holding anything. Signal 0 tests for existence.
    try {
      process.kill(held.pid, 0);
    } catch {
      return null;
    }
    return held;
  } catch {
    return null;
  }
}

/** Takes the lock, or returns the suite already holding it. */
export function takeStackLock(root, suite) {
  const held = heldBy(root);
  if (held) return held;

  writeFileSync(lockPath(root), JSON.stringify({ suite, pid: process.pid, at: Date.now() }));
  return null;
}

export function releaseStackLock(root) {
  rmSync(lockPath(root), { force: true });
}
