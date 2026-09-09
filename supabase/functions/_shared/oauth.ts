// The OAuth broker. Provider tokens are obtained over the back channel,
// encrypted, and stored. They never reach the browser; a job decrypts one for a
// single outbound call at a time.
//
// Endpoints and scopes come from the `providers` row, not from this file. What
// lives here is the handful of things providers genuinely disagree about, one
// small entry per slug, so a fix to token-exchange error handling is made once.

import { ApiError } from './errors.ts';
import { randomToken, sha256Base64Url } from './crypto.ts';
import { denoEnv, type EnvSource, functionsBaseUrl } from './env.ts';
import { type HttpDeps, liveHttp } from './deps.ts';
import {
  type OAuthProviderRecord,
  type ProviderRecord,
  requireOAuthProvider,
} from './providers.ts';

export const STATE_TTL_SECONDS = 600;

// How long a token may sit in pending_connections waiting to be claimed. The
// claim is one redirect away, so this covers a slow page load rather than a
// user's attention span. Short on purpose: the ticket sits in a URL.
export const PENDING_TTL_SECONDS = 300;

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
  externalAccountId: string | null;
}

export interface OAuthDriver {
  slug: string;
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
  refreshTokens(input: {
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
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn)) return null;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function splitScopes(scope: unknown): string[] {
  if (typeof scope !== 'string' || scope.length === 0) return [];
  return scope.split(/[\s,]+/).filter((part) => part.length > 0);
}

function readString(source: unknown, key: string): string | null {
  if (typeof source !== 'object' || source === null) return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Providers signal failure with a 200 and an `error` field as often as with a
 * non-2xx status, so both count. Nothing from the response body is forwarded:
 * a provider's error text can quote the request back, and the request carries
 * the code and the client secret.
 */
async function postForToken(
  deps: HttpDeps,
  url: string,
  body: URLSearchParams,
  extraHeaders: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await deps.fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
        ...extraHeaders,
      },
      body,
    });
  } catch {
    throw new ApiError(502, 'provider_unreachable', 'could not reach the provider');
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(502, 'provider_error', 'the provider returned an unreadable response');
  }

  const record = (payload ?? {}) as Record<string, unknown>;
  if (!response.ok || typeof record.error === 'string') {
    console.error('provider token exchange failed', {
      status: response.status,
      code: record.error,
    });
    throw new ApiError(502, 'provider_error', 'the provider rejected the token request');
  }
  return record;
}

/**
 * Never throws: naming the account is a nicety, and a connection that works
 * should not fail because the label lookup did. It does say so in the log,
 * because a silent null is how every Google connection once ended up nameless.
 */
async function fetchJson(
  deps: HttpDeps,
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  try {
    const response = await deps.fetch(url, { headers: { accept: 'application/json', ...headers } });
    if (!response.ok) {
      // The host only, never the query: a token can ride in one.
      console.error('account lookup refused', { host: new URL(url).host, status: response.status });
      return null;
    }
    return await response.json();
  } catch {
    console.error('account lookup unreachable', { host: new URL(url).host });
    return null;
  }
}

/** What one provider differs by. Everything not named here is identical. */
interface DriverQuirks {
  /** Linear wants commas. Everyone else wants a space. */
  scopeSeparator?: string;
  extraAuthParams?: Record<string, string>;
  /**
   * Credentials in an Authorization header rather than the body. Notion answers
   * 401 to a request that puts them in the form.
   */
  basicAuthForToken?: boolean;
  /**
   * Which query parameter carries the scopes. Slack v2 splits them: `scope`
   * buys a bot token, `user_scope` buys one that acts as the person, and
   * everything Recall reads is the person's.
   */
  scopeParam?: string;
  /** Lifts the token out of a non-standard envelope before the shared path. */
  normalizePayload?(payload: Record<string, unknown>): Record<string, unknown>;
  /** The account label after a code exchange. Must not throw. */
  accountFromExchange?(
    deps: HttpDeps,
    payload: Record<string, unknown>,
    accessToken: string,
  ): Promise<string | null>;
}

const QUIRKS: Record<string, DriverQuirks> = {
  google_drive: {
    // Without both of these Google issues a refresh token on the very first
    // consent and never again, so a reconnect leaves a token that dies in an
    // hour and no way to renew it.
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    async accountFromExchange(deps, _payload, accessToken) {
      const info = await fetchJson(deps, 'https://www.googleapis.com/drive/v3/about?fields=user', {
        authorization: `Bearer ${accessToken}`,
      });
      const user = typeof info === 'object' && info !== null
        ? (info as Record<string, unknown>).user
        : null;
      return readString(user, 'emailAddress');
    },
  },

  linear: {
    scopeSeparator: ',',
    async accountFromExchange(deps, _payload, accessToken) {
      const info = await fetchJson(
        deps,
        'https://api.linear.app/graphql?query=%7Bviewer%7Bemail%7D%7D',
        { authorization: accessToken },
      );
      const data = typeof info === 'object' && info !== null
        ? (info as Record<string, unknown>).data
        : null;
      const viewer = typeof data === 'object' && data !== null
        ? (data as Record<string, unknown>).viewer
        : null;
      return readString(viewer, 'email');
    },
  },

  notion: {
    // Capabilities are set on the integration, so there are no scopes to ask
    // for, and the public flow requires saying who is installing it.
    extraAuthParams: { owner: 'user' },
    basicAuthForToken: true,
    accountFromExchange(_deps, payload) {
      // The workspace is what a person recognises; the bot id is the fallback
      // so the row is never nameless.
      return Promise.resolve(
        readString(payload, 'workspace_id') ??
          readString(payload, 'workspace_name') ??
          readString(payload, 'bot_id'),
      );
    },
  },

  slack: {
    scopeParam: 'user_scope',
    // Slack returns the user token nested under authed_user and puts a bot token
    // at the top level. Reading channels as the person needs the user one.
    normalizePayload(payload) {
      const authed = payload.authed_user;
      if (typeof authed !== 'object' || authed === null) return payload;
      return { ...payload, ...(authed as Record<string, unknown>) };
    },
    accountFromExchange(_deps, payload) {
      return Promise.resolve(readString(payload.team, 'id') ?? readString(payload.team, 'name'));
    },
  },
};

function requireAccessToken(payload: Record<string, unknown>, context: string): string {
  const accessToken = payload.access_token;
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new ApiError(502, 'provider_error', `${context} returned no access token`);
  }
  return accessToken;
}

/**
 * Builds the driver for one provider row.
 *
 * Throws rather than returning null for an api_key provider: reaching here with
 * one is a routing mistake in the caller, not a request the user can fix.
 */
export function oauthDriverFor(record: ProviderRecord, deps: HttpDeps = liveHttp): OAuthDriver {
  const provider: OAuthProviderRecord = requireOAuthProvider(record);
  const quirks: DriverQuirks = Object.hasOwn(QUIRKS, provider.slug) ? QUIRKS[provider.slug] : {};
  const normalize = quirks.normalizePayload ?? ((payload: Record<string, unknown>) => payload);

  return {
    slug: provider.slug,
    scopes: provider.scopes,

    buildAuthUrl({ clientId, redirectUri, state, codeChallenge }) {
      const scopes = provider.scopes.join(quirks.scopeSeparator ?? ' ');
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        // An empty scope parameter is not the same as none: Notion has no scopes
        // at all and refuses a request carrying an empty one.
        ...(scopes ? { [quirks.scopeParam ?? 'scope']: scopes } : {}),
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        ...quirks.extraAuthParams,
      });
      return `${provider.auth_url}?${params}`;
    },

    async exchangeCode({ clientId, clientSecret, redirectUri, code, codeVerifier }) {
      // Basic-auth providers still need the redirect and code in the body; only
      // the credentials move to the header.
      const basic = quirks.basicAuthForToken === true;
      const form = new URLSearchParams({
        ...(basic ? {} : { client_id: clientId, client_secret: clientSecret }),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
      });

      const payload = normalize(
        await postForToken(
          deps,
          provider.token_url,
          form,
          basic ? { authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` } : {},
        ),
      );

      const accessToken = requireAccessToken(payload, 'the provider');

      return {
        accessToken,
        refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : null,
        expiresAt: expiresAtFrom(payload.expires_in),
        scopes: splitScopes(payload.scope),
        externalAccountId: (await quirks.accountFromExchange?.(deps, payload, accessToken)) ?? null,
      };
    },

    async refreshTokens({ clientId, clientSecret, refreshToken }) {
      const payload = normalize(
        await postForToken(
          deps,
          provider.token_url,
          new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }),
        ),
      );

      return {
        accessToken: requireAccessToken(payload, 'refresh'),
        // Keeping the old token when a response omits it survives a provider
        // that rotates on some calls and not others. Linear rotates; most do not.
        refreshToken: typeof payload.refresh_token === 'string'
          ? payload.refresh_token
          : refreshToken,
        expiresAt: expiresAtFrom(payload.expires_in),
        scopes: splitScopes(payload.scope),
        externalAccountId: null,
      };
    },
  };
}

/**
 * Where a provider sends the browser back. From configuration, never from the
 * request, so a crafted redirect_uri cannot send the authorization code
 * somewhere else.
 */
export function callbackUrl(source: EnvSource = denoEnv): string {
  return `${functionsBaseUrl(source)}/connections-callback`;
}

// Same-site absolute paths only. A bad one is discarded rather than rejected, so
// it cannot fail an otherwise successful connection.
export function safeReturnTo(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.includes('\\')) return null;
  return value;
}
