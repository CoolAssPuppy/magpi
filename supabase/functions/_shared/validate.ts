// Input validation at the Edge Function boundary. Every schema is strict:
// unknown keys are rejected rather than stripped, so a client cannot smuggle a
// field past a handler that spreads the parsed object.

import { z } from 'zod';

import { ApiError } from './errors.ts';

// Anchored, and the leading character may not be a hyphen, so "../etc" and
// similar path fragments cannot pass.
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

const slug = z.string().regex(SLUG_RE).max(64);

export const connectionsBeginSchema = z.strictObject({
  provider: slug,
  /** The space this connection lands in, chosen before the redirect. */
  space_id: z.uuid(),
  // Where to send the browser once the connection completes. Bounded here;
  // safeReturnTo decides whether the value is a same-site path.
  return_to: z.string().max(512).optional(),
});

// The ticket is a base64url randomToken(). Bounded rather than pattern-matched,
// so a malformed one fails the hash lookup like any other unknown ticket and
// "wrong shape" stays indistinguishable from "already used".
export const connectionsClaimSchema = z.strictObject({
  ticket: z.string().min(1).max(256),
});

/**
 * The picker, both halves in one call.
 *
 * `selected` present saves a choice; absent just refreshes what is on offer.
 * Ids only, bounded in count and length, because the driver decides what an id
 * means and the column must not become free storage.
 */
export const connectionsScopesSchema = z.strictObject({
  connection_id: z.uuid(),
  selected: z.array(z.string().min(1).max(200)).max(500).optional(),
});

export const connectionsSyncSchema = z.strictObject({
  connection_id: z.uuid(),
  /** Clears the cursor first, so the whole account is read again. */
  full: z.boolean().default(false),
});

export const ingestEnqueueSchema = z.strictObject({
  space_id: z.uuid(),
  /** Where the dropzone put the bytes. Read by the worker, never by the browser. */
  storage_path: z.string().min(1).max(1024),
  title: z.string().trim().min(1).max(300),
  mime_type: z.string().min(1).max(128),
});

/** A worker invocation. Bounded so one call cannot ask for unbounded work. */
export const workerBatchSchema = z.strictObject({
  batch: z.number().int().min(1).max(25).optional(),
});

export const dreamRunSchema = z.strictObject({
  space_id: z.uuid(),
  kind: z.enum(['entities', 'digest', 'connections']),
});

/** Throws a 400 ApiError carrying the issue list. */
export function parseBody<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw new ApiError(400, 'invalid_request', 'request body failed validation', {
    detail: {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    },
  });
}

/**
 * Whether an uploaded object belongs to the space the caller named.
 *
 * Objects are keyed `${space_id}/${document_id}/${filename}` and the storage
 * policy checks that first segment against the caller's visible spaces. The same
 * check happens again when a document is filed, because a row pointing at
 * someone else's bytes would be read by the worker under the service role, where
 * no policy is watching.
 */
export function isUploadInSpace(storagePath: string, spaceId: string): boolean {
  if (storagePath.includes('..') || storagePath.startsWith('/')) return false;
  return storagePath.startsWith(`${spaceId}/`) && storagePath.length > spaceId.length + 1;
}

/** A provider slug becomes part of an upstream URL, so "../" must not survive. */
export function isValidSlug(value: string): boolean {
  return value.length <= 64 && SLUG_RE.test(value);
}
