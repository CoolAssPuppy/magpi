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
  type ProviderRecord,
  requireOAuthProvider,
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
export function createPkce(): {
  verifier: string;
  challengePromise: Promise<string>;
} {
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
async function postForToken(
  url: string,
  body: URLSearchParams,
  extraHeaders: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        ...extraHeaders,
      },
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

/**
 * Never throws: naming the account is a nicety, and a connection that works
 * should not fail because the label lookup did.
 *
 * It does say so, though. A silent null here is how every Google connection
 * ended up nameless for a day: the endpoint needed a scope nobody had asked
 * for, answered 401, and nothing anywhere mentioned it.
 */
async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", ...headers },
    });
    if (!response.ok) {
      // The host only, never the query: a token can ride in one.
      console.error("account lookup refused", {
        host: new URL(url).host,
        status: response.status,
      });
      return null;
    }
    return await response.json();
  } catch {
    console.error("account lookup unreachable", { host: new URL(url).host });
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
  /**
   * Credentials in an Authorization header rather than the body. Notion
   * answers 401 to a request that puts them in the form, which is why its
   * connect never came back.
   */
  basicAuthForToken?: boolean;
  /**
   * Which query parameter carries the scopes.
   *
   * Slack v2 splits them: `scope` buys a bot token, `user_scope` buys one that
   * acts as the person. Everything this product reads is the person's, and
   * normalizePayload already digs the user token out of authed_user, so asking
   * under `scope` was asking for the wrong token with scopes that are not
   * valid for it.
   */
  scopeParam?: string;
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
      // The Gmail profile, not the OpenID userinfo endpoint: userinfo needs
      // the openid and email scopes, which this does not ask for, so it
      // answered 401 and every Google connection came out nameless. This
      // works on gmail.metadata, which is already granted, and returns the
      // mailbox the counters are actually counting.
      const info = await fetchJson("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        authorization: `Bearer ${accessToken}`,
      });
      return readString(info, "emailAddress");
    },
  },

  linear: {
    scopeSeparator: ",",
    async accountFromExchange(_payload, accessToken) {
      const info = await fetchJson("https://api.linear.app/graphql?query=%7Bviewer%7Bemail%7D%7D", {
        authorization: accessToken,
      });
      const data =
        typeof info === "object" && info !== null ? (info as Record<string, unknown>).data : null;
      const viewer =
        typeof data === "object" && data !== null ? (data as Record<string, unknown>).viewer : null;
      return readString(viewer, "email");
    },
  },

  notion: {
    // Capabilities are set on the integration, so there are no scopes to ask
    // for, and the public flow requires saying who is installing it.
    extraAuthParams: { owner: "user" },
    // Notion wants the client id and secret as HTTP Basic, and rejects them in
    // the body.
    basicAuthForToken: true,
    accountFromExchange(payload) {
      // The workspace is what a person recognises; the bot id is the fallback
      // so the row is never nameless.
      const owner = payload.owner;
      const person =
        typeof owner === "object" && owner !== null
          ? (owner as Record<string, unknown>).user
          : null;
      const email =
        typeof person === "object" && person !== null
          ? readString((person as Record<string, unknown>).person, "email")
          : null;
      return Promise.resolve(
        email ?? readString(payload, "workspace_name") ?? readString(payload, "bot_id"),
      );
    },
  },

  slack: {
    scopeParam: "user_scope",
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
      const scopes = provider.scopes.join(quirks.scopeSeparator ?? " ");
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        // An empty scope parameter is not the same as none: Notion has no
        // scopes at all and reads better without the key.
        ...(scopes ? { [quirks.scopeParam ?? "scope"]: scopes } : {}),
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
      // Basic-auth providers still need the redirect and code in the body;
      // only the credentials move to the header.
      const basic = quirks.basicAuthForToken === true;
      const form = new URLSearchParams({
        ...(basic ? {} : { client_id: clientId, client_secret: clientSecret }),
        redirect_uri: redirectUri,
        ...(grantType ? { grant_type: grantType } : {}),
        code,
        code_verifier: codeVerifier,
      });
      const payload = normalize(
        await postForToken(
          provider.token_url,
          form,
          basic ? { authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` } : {},
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
  if (!base) {
    throw new ApiError(500, "misconfigured", "server is not configured");
  }
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
