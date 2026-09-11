// The OAuth broker: authorize and exchange. Endpoints and scopes come from the `providers` row.

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

// How long a token may wait in pending_connections to be claimed. Short, since it sits in a URL.
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

/** Treats a 200 with an `error` field as failure. No part of the response body reaches callers. */
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

/** Fetches JSON for an account label. Never throws; logs and returns null instead. */
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
  /** Credentials in an Authorization header rather than the body. Notion answers 401 otherwise. */
  basicAuthForToken?: boolean;
  /** Which query parameter carries the scopes. Slack v2 wants user_scope for a person's token. */
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
    // Without both of these, Google issues a refresh token only on the first consent.
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

  github: {
    async accountFromExchange(deps, _payload, accessToken) {
      const info = await fetchJson(deps, 'https://api.github.com/user', {
        authorization: `Bearer ${accessToken}`,
        // GitHub answers 403 to a request with no user agent, including this one.
        'user-agent': 'magpi',
      });
      return readString(info, 'login');
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
    // Notion has no scopes to ask for, and the public flow requires naming the installing owner.
    extraAuthParams: { owner: 'user' },
    basicAuthForToken: true,
    accountFromExchange(_deps, payload) {
      // The workspace is what a person recognises; the bot id keeps the row from being nameless.
      return Promise.resolve(
        readString(payload, 'workspace_id') ??
          readString(payload, 'workspace_name') ??
          readString(payload, 'bot_id'),
      );
    },
  },

  slack: {
    scopeParam: 'user_scope',
    // Slack nests the user token under authed_user; the top-level token is the bot's.
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

function quirksFor(slug: string): DriverQuirks {
  return Object.hasOwn(QUIRKS, slug) ? QUIRKS[slug] : {};
}

/** Credentials in a header, for the providers that answer 401 to them in a form. */
export function basicAuthHeader(clientId: string, clientSecret: string): Record<string, string> {
  return { authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` };
}

/** What one provider's token endpoint disagrees about on a refresh grant. */
export interface TokenGrantQuirks {
  basicAuth: boolean;
  normalizePayload(payload: Record<string, unknown>): Record<string, unknown>;
}

export function tokenGrantQuirksFor(slug: string): TokenGrantQuirks {
  const quirks = quirksFor(slug);
  return {
    basicAuth: quirks.basicAuthForToken === true,
    normalizePayload: quirks.normalizePayload ?? ((payload) => payload),
  };
}

function requireAccessToken(payload: Record<string, unknown>, context: string): string {
  const accessToken = payload.access_token;
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new ApiError(502, 'provider_error', `${context} returned no access token`);
  }
  return accessToken;
}

/** Builds the driver for one provider row. Throws for an api_key provider. */
export function oauthDriverFor(record: ProviderRecord, deps: HttpDeps = liveHttp): OAuthDriver {
  const provider: OAuthProviderRecord = requireOAuthProvider(record);
  const quirks = quirksFor(provider.slug);
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
        // An empty scope parameter is not the same as none, and Notion refuses an empty one.
        ...(scopes ? { [quirks.scopeParam ?? 'scope']: scopes } : {}),
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        ...quirks.extraAuthParams,
      });
      return `${provider.auth_url}?${params}`;
    },

    async exchangeCode({ clientId, clientSecret, redirectUri, code, codeVerifier }) {
      // Basic-auth providers still need the redirect and code in the body.
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
          basic ? basicAuthHeader(clientId, clientSecret) : {},
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
  };
}

/** Where a provider sends the browser back. From configuration, never from the request. */
export function callbackUrl(source: EnvSource = denoEnv): string {
  return `${functionsBaseUrl(source)}/connections-callback`;
}

// Same-site absolute paths only. A bad one is discarded rather than rejected.
export function safeReturnTo(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.includes('\\')) return null;
  return value;
}
