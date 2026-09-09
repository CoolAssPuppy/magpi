// POST /ingest-enqueue. What the dropzone calls once the bytes are in Storage.
//
// Files a documents row and one ingest_jobs row. The worker does the reading;
// this only decides that the caller may put something in that space and that the
// organization is allowed another document.

import { ApiError, jsonResponse } from '../_shared/errors.ts';
import { serveFunction } from '../_shared/http.ts';
import { ingestEnqueueSchema, isUploadInSpace, parseBody } from '../_shared/validate.ts';
import { audit, serviceClient } from '../_shared/db.ts';
import { enforceRateLimits } from '../_shared/rate_limit.ts';
import { requireSpaceMembership, requireUser } from '../_shared/auth.ts';
import { isExtractable } from '../_shared/extract.ts';

interface IngestAllowance {
  allowed: boolean;
  reason: string | null;
  used: number;
  plan_limit: number;
}

serveFunction('ingest-enqueue', async (core) => {
  const input = parseBody(ingestEnqueueSchema, core.body);
  const user = await requireUser(core.headers);
  const db = serviceClient();

  await enforceRateLimits(db, [
    { bucket: `ingest-enqueue:user:${user.id}`, limit: 120, windowSeconds: 600 },
    { bucket: `ingest-enqueue:ip:${core.ip}`, limit: 240, windowSeconds: 600 },
  ]);

  const { orgId } = await requireSpaceMembership(db, user.id, input.space_id);

  if (!isUploadInSpace(input.storage_path, input.space_id)) {
    throw new ApiError(400, 'invalid_request', 'that upload does not belong to that space');
  }

  if (!isExtractable(input.mime_type)) {
    throw new ApiError(415, 'unsupported_type', `${input.mime_type} cannot be indexed yet`);
  }

  // Plan limits live in the database, not the client.
  const { data: allowance, error: allowanceError } = await db
    .rpc('check_ingest_allowed', { p_org_id: orgId })
    .single<IngestAllowance>();
  if (allowanceError) throw new ApiError(500, 'internal', 'the plan limit could not be checked');
  if (!allowance.allowed) {
    throw new ApiError(402, 'plan_limit_reached', allowance.reason ?? 'plan limit reached', {
      detail: { used: allowance.used, limit: allowance.plan_limit },
    });
  }

  const { data: document, error: documentError } = await db
    .from('documents')
    .insert({
      org_id: orgId,
      space_id: input.space_id,
      title: input.title,
      mime_type: input.mime_type,
      storage_path: input.storage_path,
      origin: 'upload',
    })
    .select('id')
    .single<{ id: string }>();
  if (documentError || !document) {
    throw new ApiError(500, 'internal', 'the document could not be filed');
  }

  const { data: job, error: jobError } = await db
    .from('ingest_jobs')
    .insert({
      org_id: orgId,
      space_id: input.space_id,
      document_id: document.id,
      status: 'queued',
      stage: 'fetch',
    })
    .select('id')
    .single<{ id: string }>();
  if (jobError || !job) throw new ApiError(500, 'internal', 'the import could not be queued');

  audit({
    actor: `user:${user.id}`,
    action: 'ingest.enqueue',
    target: document.id,
    ip: core.ip,
    meta: { space_id: input.space_id, mime_type: input.mime_type },
  });

  return jsonResponse({ document_id: document.id, job_id: job.id }, { status: 202 });
});
