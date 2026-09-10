import { toErrorResponse } from './errors.ts';
import { denoEnv, type EnvSource } from './env.ts';

export interface CoreRequest {
  method: string;
  /** Path within the function, e.g. "/run". */
  path: string;
  query: URLSearchParams;
  headers: Headers;
  /** Parsed JSON body, or null when absent or not valid JSON. */
  body: unknown;
  ip: string;
}

/** Who a per-IP rate limit counts against: cf-connecting-ip, then the rightmost forwarded entry. */
export function clientIp(headers: Headers): string {
  const resolved = headers.get('cf-connecting-ip')?.trim();
  if (resolved) return resolved;

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const nearest = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .at(-1);
    if (nearest) return nearest;
  }
  return 'unknown';
}

/** Parses a fetch Request into the framework-free shape the handlers take. */
export async function toCoreRequest(req: Request, functionName: string): Promise<CoreRequest> {
  const url = new URL(req.url);
  const marker = `/${functionName}`;
  const at = url.pathname.indexOf(marker);
  const rest = at >= 0 ? url.pathname.slice(at + marker.length) : '';

  let body: unknown = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const text = await req.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
  }

  return {
    method: req.method.toUpperCase(),
    path: rest === '' ? '/' : rest,
    query: url.searchParams,
    headers: req.headers,
    body,
    ip: clientIp(req.headers),
  };
}

// An allowlist, not `*`. SB_WEB_ORIGINS is comma separated; the localhost default drops once set.
function allowedOrigins(source: EnvSource): string[] {
  const configured = source.get('SB_WEB_ORIGINS');
  if (configured) {
    return configured
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }
  return ['http://localhost:3000', 'http://127.0.0.1:3000'];
}

const CORS_BASE: Record<string, string> = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '600',
  // The permitted origin varies per request, so caches must not cross origins.
  Vary: 'Origin',
};

export function corsHeadersFor(
  headers: Headers,
  source: EnvSource = denoEnv,
): Record<string, string> {
  const origin = headers.get('origin');
  if (origin && allowedOrigins(source).includes(origin)) {
    return { ...CORS_BASE, 'Access-Control-Allow-Origin': origin };
  }
  // No allow-origin for a disallowed origin. The request runs; the browser hides the response.
  return { ...CORS_BASE };
}

export function handleOptions(req: Request, source: EnvSource = denoEnv): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: corsHeadersFor(req.headers, source) });
}

export function withCors(res: Response, req: Request, source: EnvSource = denoEnv): Response {
  const out = new Response(res.body, res);
  for (const [key, value] of Object.entries(corsHeadersFor(req.headers, source))) {
    out.headers.set(key, value);
  }
  return out;
}

/** The shell every CORS-serving function shares: preflight, parsing, CORS headers, errors. */
export function serveFunction(
  functionName: string,
  handler: (core: CoreRequest) => Promise<Response>,
): void {
  Deno.serve(async (req: Request) => {
    const preflight = handleOptions(req);
    if (preflight) return preflight;
    try {
      return withCors(await handler(await toCoreRequest(req, functionName)), req);
    } catch (err) {
      return withCors(toErrorResponse(err), req);
    }
  });
}
