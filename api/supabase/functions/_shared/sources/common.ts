// Plumbing every provider client shares: one request path, one set of
// defensive readers, one timezone conversion.
//
// Upstream JSON is untrusted. Reading a field off it directly is how a client
// turns a provider's bad day into a 500 on the badge, so every read here
// answers with a default instead of throwing.

import { SourceError } from "./contract.ts";
import type { FetchDeps } from "./contract.ts";

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;

// -- Defensive readers -------------------------------------------------------

/** Narrows to a plain object. An array, a null, or a scalar reads as empty. */
export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** A count the badge renders: whole, never negative. */
export function asCount(value: unknown): number {
  return Math.max(0, Math.trunc(asNumber(value)));
}

/** First line of a possibly multi-line string, trimmed. Null when it is empty. */
export function firstLine(value: unknown): string | null {
  const text = asString(value).split("\n", 1)[0].trim();
  return text.length > 0 ? text : null;
}

/** Milliseconds for an RFC 3339 string, or null when it will not parse. */
export function parseInstant(value: unknown): number | null {
  const ms = Date.parse(asString(value));
  return Number.isNaN(ms) ? null : ms;
}

// -- Requests ----------------------------------------------------------------

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Told to the wearer when the provider refused the credential. */
  reconnectMessage: string;
  /** Told to the wearer for every other failure. */
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
  deps: FetchDeps,
  url: string,
  options: RequestOptions,
): Promise<unknown> {
  let response: Response;
  try {
    response = await deps.fetch(url, {
      method: options.method ?? "GET",
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

// -- The wearer's clock ------------------------------------------------------

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;

  const build = (zone: string): Intl.DateTimeFormat =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = build(timeZone);
  } catch {
    // An unrecognised IANA name would otherwise take every page down at once.
    formatter = build("UTC");
  }
  formatters.set(timeZone, formatter);
  return formatter;
}

export function localParts(instant: Date, timeZone: string): LocalParts {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const read = (type: string): number => {
    const found = parts.find((part) => part.type === type);
    const value = found ? Number(found.value) : 0;
    return Number.isFinite(value) ? value : 0;
  };
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

function pad2(value: number): string {
  return String(Math.trunc(value)).padStart(2, "0");
}

/** HH:MM on the wearer's clock. */
export function localClock(instant: Date, timeZone: string): string {
  const parts = localParts(instant, timeZone);
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = localParts(instant, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant at which the wearer's clock reads the given local wall time.
 *
 * Two passes: the offset of the first guess can be the wrong side of a
 * daylight saving change, and re-reading it with a corrected instant settles
 * everything except the one hour that does not exist.
 */
export function zonedInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour);
  const first = wall - zoneOffsetMs(new Date(wall), timeZone);
  return new Date(wall - zoneOffsetMs(new Date(first), timeZone));
}

/** Local `hour` on the day `dayOffset` days from now, as an instant. */
export function localDayStart(deps: FetchDeps, dayOffset: number, hour: number): Date {
  const today = localParts(deps.now, deps.timeZone);
  return zonedInstant(today.year, today.month, today.day + dayOffset, hour, deps.timeZone);
}

/** A short age label such as "4m ago", for a screen with no room for a date. */
export function relativeLabel(elapsedMs: number): string {
  const minutes = Math.floor(elapsedMs / MINUTE_MS);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
