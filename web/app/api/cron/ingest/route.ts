import type { NextRequest } from 'next/server';

import { runWorker } from '../worker';

/** Every two minutes. A batch of 25 is what one Edge Function budget fits. */
export async function GET(request: NextRequest) {
  return runWorker(request, 'ingest-worker', { batch: 25 });
}
