// Building the injected clients a job body takes, once, from the environment.
//
// This is the only place the workers read the environment. The job bodies never
// do, which is what lets a test run one directly and what makes moving off Edge
// Functions a change here rather than in three job bodies.

import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError, bearerToken } from '../errors.ts';
import { coreEnv, denoEnv, type EnvSource, openAiKey } from '../env.ts';
import { liveHttp } from '../deps.ts';
import { serviceClient } from '../db.ts';
import { createModelRunner } from '../model_client.ts';
import { timingSafeEqual } from '../crypto.ts';
import type { JobDeps, UploadStore } from './types.ts';

/** Objects are keyed `${space_id}/${document_id}/${filename}`. */
const UPLOAD_BUCKET = 'documents';

export function storageUploads(db: SupabaseClient): UploadStore {
  return {
    async read(storagePath) {
      const { data, error } = await db.storage.from(UPLOAD_BUCKET).download(storagePath);
      if (error || !data) {
        // The path is the caller's; the reason is not theirs to see.
        console.error('upload could not be read', storagePath, error?.message);
        throw new ApiError(404, 'upload_missing', 'that upload could not be read');
      }
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}

export function jobDepsFromEnv(source: EnvSource = denoEnv): JobDeps {
  const db = serviceClient(source);
  return {
    db,
    http: { fetch: liveHttp.fetch, now: () => new Date() },
    models: createModelRunner({
      db,
      apiKey: openAiKey(source),
      fetch: liveHttp.fetch,
      now: () => new Date(),
    }),
    uploads: storageUploads(db),
    env: source,
  };
}

/**
 * A worker is machinery, not a user surface.
 *
 * Only something already holding the service role key may start one, which is
 * the scheduler and nothing else. Compared in constant time because the header
 * is attacker-supplied and a byte-at-a-time comparison leaks the key.
 */
export function requireWorkerCaller(headers: Headers, source: EnvSource = denoEnv): void {
  const token = bearerToken(headers.get('authorization'), 'missing worker credential');
  if (!timingSafeEqual(token, coreEnv(source).serviceRoleKey)) {
    throw new ApiError(403, 'forbidden', 'this endpoint is not called directly');
  }
}
