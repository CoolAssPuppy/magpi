import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getBadgeApiUrl, getSupabasePublishableKey, getSupabaseUrl } from "@/lib/env";
import { isSupabaseAuthCookie, readSessionUser } from "@/lib/supabase/session";

const PROTECTED_PREFIXES = ["/dashboard", "/pages", "/connections", "/link", "/settings"];

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Loopback is not a network anyone can watch, and a production build has to be
 * runnable over plain http to be checked before it ships. Safari honours
 * upgrade-insecure-requests on localhost where Chrome exempts it, so leaving
 * the directive on turns every asset into a failed TLS handshake and the page
 * never becomes interactive.
 */
function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function buildCsp(nonce: string, hostname: string): string {
  const connectSrc = new Set(["'self'"]);
  for (const url of [getSupabaseUrl(), getBadgeApiUrl()]) {
    const origin = originOf(url);
    if (!origin) continue;
    connectSrc.add(origin);
    // Realtime is a WebSocket to the same host. A scheme is part of a CSP
    // source, so https://x.supabase.co does not permit wss://x.supabase.co and
    // the socket is refused with nothing on the page to say why.
    connectSrc.add(origin.replace(/^http/, "ws"));
  }

  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (process.env.NODE_ENV !== "production") {
    // React dev tooling requires eval in development only.
    scriptSrc.push("'unsafe-eval'");
  }

  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(" ")}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src ${[...connectSrc].join(" ")}`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ];
  // Not in development either: a phone reaches the dev server over plain HTTP
  // on the badge's WiFi, and upgrading that form action makes every button
  // inert.
  if (process.env.NODE_ENV === "production" && !isLoopback(hostname)) {
    directives.push("upgrade-insecure-requests");
  }
  return directives.join("; ");
}

function applySecurityHeaders(response: NextResponse, csp: string, nonce: string): void {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-nonce", nonce);
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(), usb=()",
  );
}

/** Session refresh, security headers, and route gating. */
export async function updateSession(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, request.nextUrl.hostname);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);
  requestHeaders.set("x-nonce", nonce);

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        // Rewrite the forwarded cookie header, not just the response.
        //
        // requestHeaders was snapshotted before getUser ran, so it still
        // carries the cookie the browser sent. Rotation burns that refresh
        // token immediately, and a downstream server component would then get
        // the burned original and render as signed out.
        requestHeaders.set("cookie", request.cookies.toString());
        supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const { user, isStale } = await readSessionUser(supabase);

  // Delete the dead cookie once here. Leaving it repeats the failed refresh on
  // every downstream request, forever.
  const staleCookieNames = isStale
    ? request.cookies
        .getAll()
        .map((cookie) => cookie.name)
        .filter(isSupabaseAuthCookie)
    : [];

  const clearStaleCookies = (response: NextResponse): void => {
    for (const name of staleCookieNames) response.cookies.delete(name);
  };

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  /**
   * The cookie copy is required. getUser may have rotated the refresh token
   * onto supabaseResponse, and rotation burns the old token immediately, so a
   * fresh redirect carrying no cookies signs the user straight back out and
   * bounces them between the homepage and the page they asked for.
   */
  const redirectTo = (url: URL): NextResponse => {
    const response = NextResponse.redirect(url);
    for (const cookie of supabaseResponse.cookies.getAll()) response.cookies.set(cookie);
    clearStaleCookies(response);
    applySecurityHeaders(response, csp, nonce);
    return response;
  };

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return redirectTo(url);
  }

  // The homepage is for strangers. A signed-in visitor wants the dashboard.
  if (pathname === "/" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return redirectTo(url);
  }

  clearStaleCookies(supabaseResponse);
  applySecurityHeaders(supabaseResponse, csp, nonce);
  return supabaseResponse;
}
