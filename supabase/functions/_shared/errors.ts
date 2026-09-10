// The error envelope every function answers with: { error, message, detail }.

export type ErrorDetail = Record<string, unknown>;

export interface ErrorEnvelope {
  error: string;
  message: string;
  detail?: ErrorDetail;
  /** Fields some clients read directly off the envelope, such as retry_after. */
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail?: ErrorDetail;
  readonly topLevel?: Record<string, unknown>;
  readonly headers?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    opts?: {
      detail?: ErrorDetail;
      topLevel?: Record<string, unknown>;
      headers?: Record<string, string>;
    },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = opts?.detail;
    this.topLevel = opts?.topLevel;
    this.headers = opts?.headers;
  }
}

/** The 500 every misconfiguration answers with; which secret is missing goes to the log only. */
export function misconfigured(logDetail: string): ApiError {
  console.error('misconfigured:', logDetail);
  return new ApiError(500, 'misconfigured', 'server is not configured');
}

export function errorEnvelope(
  code: string,
  message: string,
  detail?: ErrorDetail,
  topLevel?: Record<string, unknown>,
): ErrorEnvelope {
  const base: ErrorEnvelope = { error: code, message };
  if (detail !== undefined) base.detail = detail;
  return topLevel === undefined ? base : { ...base, ...topLevel };
}

export function jsonResponse(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
}

export function errorResponse(err: ApiError): Response {
  return jsonResponse(errorEnvelope(err.code, err.message, err.detail, err.topLevel), {
    status: err.status,
    headers: err.headers,
  });
}

/** An ApiError keeps its shape; anything else becomes a generic 500. */
export function toErrorResponse(err: unknown): Response {
  if (err instanceof ApiError) return errorResponse(err);
  console.error('unhandled error', err);
  return jsonResponse(errorEnvelope('internal', 'internal server error'), { status: 500 });
}

// retry_after sits in the envelope body as well as in the Retry-After header.
export function rateLimited(retryAfterSeconds: number, message = 'rate limit exceeded'): ApiError {
  const retry = Math.max(1, Math.ceil(retryAfterSeconds));
  return new ApiError(429, 'rate_limited', message, {
    topLevel: { retry_after: retry },
    headers: { 'Retry-After': String(retry) },
  });
}

/** Pulls the token out of an `Authorization: Bearer <token>` header. */
export function bearerToken(authorization: string | null, missing: string): string {
  const match = /^Bearer\s+(.+)$/i.exec((authorization ?? '').trim());
  if (!match?.[1]) throw new ApiError(401, 'unauthorized', missing);
  return match[1];
}
