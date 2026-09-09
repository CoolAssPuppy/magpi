// Plumbing every driver shares: one request path, one set of defensive readers,
// one refresh.
//
// Upstream JSON is untrusted. Reading a field off it directly is how a driver
// turns a provider's bad day into a 500, so every read here answers with a
// default instead of throwing.

import { basicAuthHeader, tokenGrantQuirksFor } from '../oauth.ts';
import { type RefreshInput, type RefreshOutcome, SourceDeps, SourceError } from './contract.ts';

export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** First line of a possibly multi-line string, trimmed. Null when it is empty. */
export function firstLine(value: unknown): string | null {
  const text = asString(value).split('\n', 1)[0].trim();
  return text.length > 0 ? text : null;
}

/** Milliseconds for an RFC 3339 string, or null when it will not parse. */
export function parseInstant(value: unknown): number | null {
  const ms = Date.parse(asString(value));
  return Number.isNaN(ms) ? null : ms;
}

/** An RFC 3339 stamp for whatever the provider gave us, falling back to now. */
export function isoStamp(value: unknown, deps: SourceDeps): string {
  const ms = parseInstant(value);
  return new Date(ms ?? deps.now().getTime()).toISOString();
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Told to the user when the provider refused the credential. */
  reconnectMessage: string;
  /** Told to the user for every other failure. */
  failureMessage: string;
}

/**
 * One request, one parsed body, and no upstream text in any error.
 *
 * A provider's own error body can quote back the request, and the request
 * carries the token. Nothing from the response reaches the thrown message.
 */
export async function requestJson(
  provider: string,
  deps: SourceDeps,
  url: string,
  options: RequestOptions,
): Promise<unknown> {
  let response: Response;
  try {
    response = await deps.fetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body,
    });
  } catch {
    // A fetch rejection carries the request URL in its cause.
    throw new SourceError(provider, options.failureMessage);
  }

  if (response.status === 401 || response.status === 403) {
    throw new SourceError(provider, options.reconnectMessage, true);
  }
  if (!response.ok) {
    throw new SourceError(provider, options.failureMessage);
  }

  try {
    return await response.json();
  } catch {
    // A body that is not JSON reads as an empty answer, which every caller
    // already has a default for.
    return null;
  }
}

/**
 * The standard refresh_token grant, which is what three of the four providers
 * speak. A driver whose tokens never expire answers `not_supported` instead of
 * calling this.
 *
 * Failure is a value: the caller writes it onto the connection as a status the
 * user can read, and a thrown error here would become a stalled sync with no
 * explanation. That is the whole reason the grant lives here rather than on the
 * OAuth broker, whose failures are exceptions on their way to an HTTP response.
 *
 * `provider` is the slug and reaches the log; `displayName` is what a person
 * calls the source and reaches connections.status_detail. Both, because one
 * string cannot be a database key and a product name at the same time.
 */
export async function refreshWithTokenEndpoint(
  provider: string,
  displayName: string,
  deps: SourceDeps,
  input: RefreshInput,
): Promise<RefreshOutcome> {
  const quirks = tokenGrantQuirksFor(provider);

  let response: Response;
  try {
    response = await deps.fetch(input.tokenUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
        ...(quirks.basicAuth ? basicAuthHeader(input.clientId, input.clientSecret) : {}),
      },
      body: new URLSearchParams({
        ...(quirks.basicAuth
          ? {}
          : { client_id: input.clientId, client_secret: input.clientSecret }),
        grant_type: 'refresh_token',
        refresh_token: input.refreshToken,
      }),
    });
  } catch {
    return {
      kind: 'failed',
      detail: `${displayName} could not be reached to renew the connection.`,
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    return { kind: 'failed', detail: `${displayName} returned an unreadable renewal response.` };
  }

  const record = quirks.normalizePayload(asRecord(payload));
  const accessToken = asString(record.access_token);
  if (!response.ok || typeof record.error === 'string' || accessToken.length === 0) {
    // The provider's own wording is not forwarded: it can quote the request,
    // and status_detail is shown to the user.
    console.error('token refresh refused', { provider, status: response.status });
    return {
      kind: 'failed',
      detail: `${displayName} refused to renew this connection, reconnect it.`,
    };
  }

  const expiresIn = asNumber(record.expires_in, 0);

  return {
    kind: 'refreshed',
    accessToken,
    // Keeping the old token when a response omits it survives a provider that
    // rotates on some calls and not others. Linear rotates; most do not.
    refreshToken: asString(record.refresh_token) || input.refreshToken,
    expiresAt: expiresIn > 0
      ? new Date(deps.now().getTime() + expiresIn * 1000).toISOString()
      : null,
  };
}

/** Ids the connection selected, as a set, for a driver filtering its listing. */
export function selectedIds(ids: string[]): Set<string> {
  return new Set(ids);
}
