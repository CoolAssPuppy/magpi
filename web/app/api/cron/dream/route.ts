import type { NextRequest } from 'next/server';

import { runWorker } from '../worker';

/**
 * Nightly at 02:00. The worker staggers by organization id rather than this
 * route doing it, so every tenant does not wake on the same minute.
 */
export async function GET(request: NextRequest) {
  return runWorker(request, 'dream-worker', { batch: 5 });
}
