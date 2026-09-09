import type { NextRequest } from 'next/server';

import { runWorker } from '../worker';

/** Hourly. Incremental, so each connection resumes from its stored cursor. */
export async function GET(request: NextRequest) {
  return runWorker(request, 'sync-worker', { batch: 10 });
}
