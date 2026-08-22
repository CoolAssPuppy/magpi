import { toErrorResponse } from "./errors.ts";

export interface CoreRequest {
  method: string;
  /** Path within the function, e.g. "/connections/complete". */
  path: string;
  query: URLSearchParams;
  headers: Headers;
  /** Parsed JSON body, or null when absent or not valid JSON. */
  body: unknown;
  ip: string;
}

/**
 * Takes the RIGHTMOST X-Forwarded-For entry. The leftmost is client-supplied,
 * so reading it lets a caller present a fresh IP per request and never reach a
 * limit. Correct for one trusted proxy hop; behind more, skip one per hop.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    const nearest = parts.at(-1);
    if (nearest) return nearest;
  }
  return headers.get("cf-connecting-ip")?.trim() ?? "unknown";
}

/** Parses a fetch Request into the framework-free shape the cores take. */
export async function toCoreRequest(req: Request, functionName: string): Promise<CoreRequest> {
  const url = new URL(req.url);
  const marker = `/${functionName}`;
  const at = url.pathname.indexOf(marker);
  const rest = at >= 0 ? url.pathname.slice(at + marker.length) : "";
  let body: unknown = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
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
    path: rest === "" ? "/" : rest,
    query: url.searchParams,
    headers: req.headers,
    body,
    ip: clientIp(req.headers),
  };
}

// An allowlist, not `*`: a wildcard alongside `authorization` in the allowed
// headers removes origin as a defence layer. WEB_ORIGINS is a comma-separated
// list; the localhost defaults drop once it is set.
function allowedOrigins(): string[] {
  const configured = Deno.env.get("WEB_ORIGINS");
  if (configured) {
    return configured
      .split(",")
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
  }
  // 3001 through 3004, because the dev server walks up the range when the base
  // port is taken and a call from a fallback port fails CORS with nothing on
  // screen to say why. Loopback only, and only while WEB_ORIGINS is unset.
  // Keep in step with BASE_PORT and PORT_RANGE in scripts/pick-port.mjs.
  const defaults: string[] = [];
  for (let port = 3001; port <= 3004; port += 1) {
    defaults.push(`http://localhost:${port}`, `http://127.0.0.1:${port}`);
  }
  return defaults;
}

const CORS_BASE: Record<string, string> = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Max-Age": "600",
  // The permitted origin varies per request, so caches must not serve one
  // origin's response to another.
  Vary: "Origin",
};

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (origin && allowedOrigins().includes(origin)) {
    return { ...CORS_BASE, "Access-Control-Allow-Origin": origin };
  }
  // No ACAO for a disallowed origin. The request still executes; the browser
  // refuses to reveal the response.
  return { ...CORS_BASE };
}

export function handleOptions(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeadersFor(req) });
}

export function withCors(res: Response, req: Request): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(corsHeadersFor(req))) out.headers.set(k, v);
  return out;
}

/**
 * The shell every CORS-serving function shares: preflight, request parsing,
 * CORS headers, and mapping a thrown ApiError onto the error envelope.
 */
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
