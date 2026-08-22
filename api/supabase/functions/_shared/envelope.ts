// The one thing the badge is ever sent.
//
// Payload discipline lives here rather than in each builder. Every string is
// truncated to what the badge can actually draw, using the caps in
// device-constants.json, so the device never receives characters it will throw
// away. The whole response is then held under PAYLOAD_MAX_BYTES.

import {
  DEFAULT_POLL_MS,
  MIN_POLL_MS,
  PAYLOAD_MAX_BYTES,
  SUBJECT_MAX,
  TITLE_MAX,
} from "./badge-constants.ts";

export const ENVELOPE_VERSION = 1;

export type PageState = "ok" | "empty" | "not_connected" | "error";

export interface PagePayload {
  slug: string;
  state: PageState;
  age_ms?: number;
  data?: Record<string, unknown>;
  message?: string;
}

export interface PomodoroPayload {
  work_min: number;
  short_min: number;
  long_min: number;
  sessions: number;
  leds: boolean;
}

export interface DeskEnvelope {
  v: number;
  server_time: string;
  poll_interval_ms: number;
  pages: PagePayload[];
  pomodoro: PomodoroPayload;
}

/** An ellipsis costs a character and says the string was cut. */
export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 1) return value.slice(0, max);
  return `${value.slice(0, max - 1)}…`;
}

export function clampPollInterval(value: unknown): number {
  const interval =
    typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : DEFAULT_POLL_MS;
  return Math.max(MIN_POLL_MS, interval);
}

/**
 * A dead provider never fails the request and never blanks the screen.
 *
 * A builder that threw becomes its own error page, carrying a message the
 * wearer can act on, and every other page carries on.
 */
export function errorPage(slug: string, message: string): PagePayload {
  return { slug, state: "error", message: truncate(message, SUBJECT_MAX) };
}

export function notConnectedPage(slug: string): PagePayload {
  return { slug, state: "not_connected" };
}

/**
 * Cut every string in a page to what the badge draws.
 *
 * Keys are matched by name rather than by builder, so a builder that adds a
 * field gets the cap for free and cannot forget to apply it.
 */
export function trimPage(page: PagePayload): PagePayload {
  if (!page.data) return page;
  return { ...page, data: trimValue(page.data) as Record<string, unknown> };
}

const TITLE_KEYS = new Set(["title", "label", "name", "heading"]);
const SUBJECT_KEYS = new Set(["recent", "commit", "message", "subject", "location"]);

function capFor(key: string): number {
  if (TITLE_KEYS.has(key)) return TITLE_MAX;
  if (SUBJECT_KEYS.has(key)) return SUBJECT_MAX;
  return TITLE_MAX;
}

function trimValue(value: unknown, key = ""): unknown {
  if (typeof value === "string") return truncate(value, capFor(key));
  if (Array.isArray(value)) return value.map((item) => trimValue(item, key));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      out[childKey] = trimValue(childValue, childKey);
    }
    return out;
  }
  return value;
}

export interface EnvelopeInput {
  serverTime: Date;
  pollIntervalMs: unknown;
  pages: PagePayload[];
  pomodoro: PomodoroPayload;
}

/**
 * Assemble, trim, and hold the result under the byte cap.
 *
 * When the cap is still exceeded, whole pages are dropped from the end rather
 * than fields from every page. A page half its size is a page that draws
 * wrong; a page that is absent is one the badge skips, which it already knows
 * how to do.
 */
export function buildEnvelope(input: EnvelopeInput): DeskEnvelope {
  const pages = input.pages.map(trimPage);
  const envelope: DeskEnvelope = {
    v: ENVELOPE_VERSION,
    server_time: input.serverTime.toISOString(),
    poll_interval_ms: clampPollInterval(input.pollIntervalMs),
    pages,
    pomodoro: input.pomodoro,
  };

  while (envelope.pages.length > 0 && byteLength(envelope) > PAYLOAD_MAX_BYTES) {
    envelope.pages = envelope.pages.slice(0, -1);
  }
  return envelope;
}

export function byteLength(envelope: DeskEnvelope): number {
  return new TextEncoder().encode(JSON.stringify(envelope)).length;
}
