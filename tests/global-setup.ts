import { resolve } from 'node:path';

import { releaseStackLock, takeStackLock } from './stack-lock.mjs';

/**
 * The browser suites take the same lock the integration runner takes.
 *
 * Both create and delete accounts on one persistent local database, so a
 * cleanup in one run deletes the organization the other is mid-assertion on.
 */
export default function globalSetup(): () => void {
  // Playwright runs from the directory holding its config, which is the root.
  const root = resolve(process.cwd());
  const held = takeStackLock(root, 'browser');

  if (held) {
    throw new Error(
      `the ${held.suite} suite is using the local database (pid ${held.pid}). ` +
        "Fixtures from two suites delete each other's accounts. Wait for it to finish.",
    );
  }

  return () => releaseStackLock(root);
}
