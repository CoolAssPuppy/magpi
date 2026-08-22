// Input validation at the Edge Function boundary. Every schema is strict:
// unknown keys are rejected rather than stripped, so a client cannot smuggle a
// field past a handler that spreads the parsed object.

import { z } from "zod";
import { ApiError } from "./errors.ts";
import { USER_CODE_ALPHABET } from "./crypto.ts";

export const USER_CODE_RE = new RegExp(`^[${USER_CODE_ALPHABET}]{4}-[${USER_CODE_ALPHABET}]{4}$`);

// Anchored, and the leading character may not be a hyphen, so "../etc" and
// similar path fragments cannot pass.
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

const slug = z.string().regex(SLUG_RE);

export const deviceStartSchema = z.strictObject({
  badge_uid: z.string().min(1).max(64),
  fw: z.string().min(1).max(32),
  sdk: z.string().min(1).max(32),
});

export const devicePollSchema = z.strictObject({
  device_code: z.string().min(1).max(256),
});

// `confirm` must be a real boolean: coercing would turn "false" into an
// approval.
export const deviceApproveSchema = z.strictObject({
  user_code: z.string().regex(USER_CODE_RE),
  confirm: z.boolean(),
});

export const connectionsBeginSchema = z.strictObject({
  provider: slug,
  // Where to send the browser once the connection completes. Bounded here;
  // safeReturnTo decides whether the value is a same-site path, and the web
  // route re-checks after the round trip.
  return_to: z.string().max(512).optional(),
});

// The ticket is a base64url randomToken(). Bounded rather than pattern-matched
// so a malformed one fails the hash lookup like any other unknown ticket,
// which keeps "wrong shape" and "already used" indistinguishable.
export const connectionsClaimSchema = z.strictObject({
  ticket: z.string().min(1).max(256),
});

/** Throws a 400 ApiError carrying the issue list. */
export function parseBody<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw new ApiError(400, "invalid_request", "request body failed validation", {
    detail: {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
  });
}

/** A provider slug becomes part of an upstream URL, so "../" must not survive. */
export function isValidSlug(value: string): boolean {
  return value.length <= 64 && SLUG_RE.test(value);
}
