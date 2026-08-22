// The OAuth broker. Provider tokens are obtained over the back channel,
// encrypted, and stored. They never reach the browser or the badge; the
// gateway decrypts them for one outbound call at a time.
//
// Endpoints and scopes come from the `providers` row, not from this file. What
// lives here is the handful of things providers genuinely disagree about, one
// small entry per slug, so a fix to token-exchange error handling is made once.

import { ApiError } from "./errors.ts";
import { randomToken, sha256Base64Url } from "./crypto.ts";
import {
  type OAuthProviderRecord,
  requireOAuthProvider,
  type ProviderRecord,
} from "./providers.ts";

export const STATE_TTL_SECONDS = 600;

// How long a token may sit in pending_connections waiting to be claimed. The
// claim is one redirect away, so this covers a slow page load rather than a
// user's attention span. Short on purpose: the ticket sits in a URL, and one
// that has expired is worthless even to the account it belongs to.
export const PENDING_TTL_SECONDS = 300;

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
  externalAccount: string | null;
}

export interface OAuthDriver {
  slug: string;
  /** The scopes the registry asks for, echoed back for the consent screen. */
  scopes: string[];
  buildAuthUrl(input: {
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
  }): string;
  exchangeCode(input: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    code: string;
    codeVerifier: string;
  }): Promise<TokenSet>;
  refresh(input: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  }): Promise<TokenSet>;
}

/** The verifier never leaves the server. */
export function createPkce(): { verifier: string; challengePromise: Promise<string> } {
  const verifier = randomToken(32);
  return { verifier, challengePromise: sha256Base64Url(verifier) };
}

export function createState(): string {
  return randomToken(32);
}

function expiresAtFrom(expiresIn: unknown): string | null {
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn)) return null;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function splitScopes(scope: unknown): string[] {
  if (typeof scope !== "string" || scope.length === 0) return [];
  return scope.split(/[\s,]+/).filter((s) => s.length > 0);
}

// Providers signal failure with a 200 and an `error` field as often as with a
// non-2xx status, so both count. The message is not forwarded: it can echo the
// code back.
async function postForToken(url: string, body: URLSearchParams): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    throw new ApiError(502, "provider_unreachable", "could not reach the provider");
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(502, "provider_error", "the provider returned an unreadable response");
  }

  const record = (payload ?? {}) as Record<string, unknown>;
  if (!response.ok || typeof record.error === "string") {
    console.error("provider token exchange failed", {
      status: response.status,
      code: record.error,
    });
    throw new ApiError(502, "provider_error", "the provider rejected the token request");
  }
  return record;
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  try {
    const response = await fetch(url, { headers: { accept: "application/json", ...headers } });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * What one provider differs by. Everything not named here is identical across
 * all of them by construction.
 */
interface DriverQuirks {
  /** Linear wants commas. Everyone else wants a space. */
  scopeSeparator?: string;
  /** Merged into the authorize query, after the shared parameters. */
  extraAuthParams?: Record<string, string>;
  /** Sent on code exchange. GitHub is the one provider that takes none. */
  exchangeGrantType?: string | null;
  /** Lifts the token out of a non-standard envelope before the shared path. */
  normalizePayload?(payload: Record<string, unknown>): Record<string, unknown>;
  /** The account label after a code exchange. Must not throw. */
  accountFromExchange?(
    payload: Record<string, unknown>,
    accessToken: string,
  ): Promise<string | null>;
  /** The account label after a refresh, when the provider says so for free. */
  accountFromRefresh?(payload: Record<string, unknown>): string | null;
}

function readString(source: unknown, key: string): string | null {
  if (typeof source !== "object" || source === null) return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

const QUIRKS: Record<string, DriverQuirks> = {
  github: {
    // GitHub answers a code exchange with no grant_type at all, and rejects
    // the request if one is sent.
    exchangeGrantType: null,
    extraAuthParams: { allow_signup: "false" },
    // A failure here must not fail the connection: the token is already valid
    // and the label is cosmetic. Not repeated on refresh, which would spend a
    // round trip to relabel a row that already has one.
    async accountFromExchange(_payload, accessToken) {
      const user = await fetchJson("https://api.github.com/user", {
        authorization: `Bearer ${accessToken}`,
        "user-agent": "magpi",
      });
      return readString(user, "login");
    },
  },

  google: {
    // Without both of these Google issues a refresh token on the very first
    // consent and never again, so a reconnect leaves the badge with a token
    // that dies in an hour.
    extraAuthParams: { access_type: "offline", prompt: "consent" },
    async accountFromExchange(_payload, accessToken) {
      const info = await fetchJson("https://openidconnect.googleapis.com/v1/userinfo", {
        authorization: `Bearer ${accessToken}`,
      });
      return readString(info, "email");
    },
  },

  linear: {
    scopeSeparator: ",",
  },

  slack: {
    // Slack returns the user token nested under authed_user and puts a bot
    // token at the top level. The mentions read needs the user one.
    normalizePayload(payload) {
      const authed = payload.authed_user;
      if (typeof authed !== "object" || authed === null) return payload;
      return { ...payload, ...(authed as Record<string, unknown>) };
    },
    accountFromExchange(payload) {
      return Promise.resolve(readString(payload.team, "name") ?? readString(payload, "id"));
    },
  },
};

function requireAccessToken(payload: Record<string, unknown>, context: string): string {
  const accessToken = payload.access_token;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new ApiError(502, "provider_error", `${context} returned no access token`);
  }
  return accessToken;
}

/**
 * Builds the driver for one provider row.
 *
 * Throws rather than returning null for an api_key provider: reaching here
 * with one is a routing mistake in the caller, not a request the user can fix.
 */
export function oauthDriverFor(record: ProviderRecord): OAuthDriver {
  const provider: OAuthProviderRecord = requireOAuthProvider(record);
  const quirks: DriverQuirks = Object.hasOwn(QUIRKS, provider.slug) ? QUIRKS[provider.slug] : {};
  const normalize = quirks.normalizePayload ?? ((payload: Record<string, unknown>) => payload);

  return {
    slug: provider.slug,
    scopes: provider.scopes,

    buildAuthUrl({ clientId, redirectUri, state, codeChallenge }) {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: provider.scopes.join(quirks.scopeSeparator ?? " "),
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        ...quirks.extraAuthParams,
      });
      return `${provider.auth_url}?${params}`;
    },

    async exchangeCode({ clientId, clientSecret, redirectUri, code, codeVerifier }) {
      const grantType =
        quirks.exchangeGrantType === undefined ? "authorization_code" : quirks.exchangeGrantType;
      const payload = normalize(
        await postForToken(
          provider.token_url,
          new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            ...(grantType ? { grant_type: grantType } : {}),
            code,
            code_verifier: codeVerifier,
          }),
        ),
      );

      const accessToken = requireAccessToken(payload, "the provider");

      return {
        accessToken,
        refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : null,
        expiresAt: expiresAtFrom(payload.expires_in),
        scopes: splitScopes(payload.scope),
        externalAccount: (await quirks.accountFromExchange?.(payload, accessToken)) ?? null,
      };
    },

    async refresh({ clientId, clientSecret, refreshToken }) {
      const payload = normalize(
        await postForToken(
          provider.token_url,
          new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
          }),
        ),
      );
      const accessToken = requireAccessToken(payload, "refresh");
      return {
        accessToken,
        // Keeping the old token when a response omits it survives a provider
        // that rotates on some calls and not others. Linear rotates; the rest
        // mostly do not.
        refreshToken:
          typeof payload.refresh_token === "string" ? payload.refresh_token : refreshToken,
        expiresAt: expiresAtFrom(payload.expires_in),
        scopes: splitScopes(payload.scope),
        externalAccount: quirks.accountFromRefresh?.(payload) ?? null,
      };
    },
  };
}

// OAUTH_ prefixed, not <SLUG>_. Supabase reserves the SUPABASE_ prefix for
// Edge Function secrets, so a provider slugged "supabase" could never have its
// credentials set under the naive scheme. One rule for every provider beats
// one rule plus an exception nobody remembers.
export function providerCredentials(slug: string): { clientId: string; clientSecret: string } {
  const prefix = `OAUTH_${slug.toUpperCase().replace(/-/g, "_")}`;
  const clientId = Deno.env.get(`${prefix}_CLIENT_ID`);
  const clientSecret = Deno.env.get(`${prefix}_CLIENT_SECRET`);
  if (!clientId || !clientSecret) {
    // 503 rather than 500: an unconfigured provider is a deployment state.
    throw new ApiError(503, "provider_unconfigured", `${slug} is not configured`);
  }
  return { clientId, clientSecret };
}

/**
 * Where a provider sends the browser back.
 *
 * From configuration, never from the request, so a crafted `redirect_uri`
 * cannot redirect the authorization code elsewhere.
 *
 * SUPABASE_URL is not that address. Inside the edge runtime it is the internal
 * gateway, http://kong:8000, and a redirect_uri naming a container hostname is
 * one no provider can send a browser to. FUNCTIONS_BASE_URL is the public
 * origin; deployed they are the same host, locally they are not.
 */
export function callbackUrl(): string {
  const explicit = Deno.env.get("FUNCTIONS_BASE_URL");
  if (explicit) return `${explicit.replace(/\/+$/, "")}/connections-callback`;

  const base = Deno.env.get("SUPABASE_URL");
  if (!base) throw new ApiError(500, "misconfigured", "server is not configured");
  return `${base.replace(/\/+$/, "")}/functions/v1/connections-callback`;
}

// Same-site absolute paths only. A bad one is discarded rather than rejected,
// so it cannot fail an otherwise successful connection.
export function safeReturnTo(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\")) return null;
  return value;
}
