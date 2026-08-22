// Fakes the five page suites share: a Supabase client backed by an in-memory
// provider_cache, a fetch that answers provider URLs from a small route table,
// and factories for the connection rows and settings a builder reads.
//
// No Deno.test lives here. It sits under testing/ so the coverage report
// counts the builders rather than their scaffolding, and so `deno test` does
// not open it looking for a suite it does not have.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { activeProviders, type ConnectionRow } from "../connections.ts";
import { encryptProviderToken } from "../provider_tokens.ts";
import type { PagePayload } from "../envelope.ts";

import type { BuildContext } from "../pages/mod.ts";

export const USER_ID = "8f1c2b7e-0000-4000-8000-000000000001";
/**
 * Every fixture is written against this clock rather than the wall clock, and
 * it is deliberately in the past: a page that ages a cached answer forward
 * clamps at zero, so a fixture behind the real clock is a fixture that reads
 * the same on every machine.
 */
export const NOW = new Date("2026-01-15T09:00:00Z");
export const NOW_MS = NOW.getTime();
export const TIME_ZONE = "UTC";

const KEY_ENV = "TOKEN_ENCRYPTION_KEY";
/** 32 ASCII bytes, base64. A test key, and the only one these suites use. */
const TEST_KEY = btoa("0123456789abcdef0123456789abcdef");

// -- Provider HTTP -----------------------------------------------------------

export interface Reply {
  status?: number;
  body?: unknown;
  /** A body that is not JSON, for the paths that have to survive one. */
  text?: string;
}

export interface StubFetch {
  fetch: typeof fetch;
  /** Every URL asked for, in order. */
  urls: string[];
  /** Request bodies, aligned with `urls`. Empty for a GET. */
  bodies: string[];
}

/**
 * Answers each request from the first route whose fragment the URL contains,
 * so a more specific fragment goes first. An unrouted URL answers 500, which
 * every client already reads as "not answering".
 */
export function stubFetch(routes: Record<string, Reply>): StubFetch {
  const urls: string[] = [];
  const bodies: string[] = [];
  const entries = Object.entries(routes);

  const fetchImpl: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    urls.push(request.url);
    bodies.push(request.method === "GET" ? "" : await request.text());

    const matched = entries.find(([fragment]) => request.url.includes(fragment));
    const reply: Reply = matched ? matched[1] : { status: 500 };
    return new Response(reply.text ?? JSON.stringify(reply.body ?? {}), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };

  return { fetch: fetchImpl, urls, bodies };
}

/** A fetch that fails the test if a builder reaches for the network at all. */
export const noFetch: typeof fetch = (input) => {
  throw new Error(`no request was expected, got ${String(input)}`);
};

// -- provider_cache ----------------------------------------------------------

const cacheRowSchema = z.object({
  user_id: z.string(),
  provider: z.string(),
  cache_key: z.string(),
  payload: z.record(z.string(), z.unknown()),
  expires_at: z.string(),
});

export type CacheRow = z.infer<typeof cacheRowSchema>;

const upsertSchema = z.union([cacheRowSchema, z.array(cacheRowSchema)]);

/** How long a seeded row stays fresh. Read against the wall clock, as the real one is. */
const SEED_TTL_MS = 60_000;

/**
 * A real Supabase client whose transport is an in-memory provider_cache.
 *
 * Going through the client rather than around it keeps the builders on the
 * code path they run in production: the same filters, the same upsert
 * conflict target, and the same maybeSingle semantics.
 */
export class FakeCache {
  readonly client: SupabaseClient;
  private readonly rows: CacheRow[] = [];
  private readonly broken: boolean;

  constructor(options: { broken?: boolean } = {}) {
    this.broken = options.broken ?? false;
    this.client = createClient("http://provider-cache.test", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => this.handle(input, init) },
    });
  }

  /** Seeds one cached payload. Fresh for a minute unless told otherwise. */
  put(overrides: Partial<CacheRow> = {}): CacheRow {
    const row: CacheRow = {
      user_id: USER_ID,
      provider: "google",
      cache_key: "cache",
      payload: {},
      expires_at: new Date(Date.now() + SEED_TTL_MS).toISOString(),
      ...overrides,
    };
    this.write(row);
    return row;
  }

  /** What is held under one key, or undefined when nothing is. */
  read(provider: string, cacheKey: string): CacheRow | undefined {
    return this.rows.find((row) => row.provider === provider && row.cache_key === cacheKey);
  }

  get all(): readonly CacheRow[] {
    return this.rows;
  }

  private write(row: CacheRow): void {
    const index = this.rows.findIndex(
      (candidate) =>
        candidate.user_id === row.user_id &&
        candidate.provider === row.provider &&
        candidate.cache_key === row.cache_key,
    );
    if (index === -1) this.rows.push(row);
    else this.rows[index] = row;
  }

  private handle(input: URL | RequestInfo, init?: RequestInit): Promise<Response> {
    const request = new Request(input, init);
    if (this.broken) return Promise.resolve(reply({ message: "cache is down" }, 500));

    const url = new URL(request.url);
    if (request.method === "GET") {
      const found = this.rows.filter((row) => matches(row, url));
      return Promise.resolve(
        reply(found.map((row) => project(row, url.searchParams.get("select")))),
      );
    }
    return request.text().then((text) => {
      const parsed = upsertSchema.safeParse(JSON.parse(text));
      if (!parsed.success) return reply({ message: "malformed row" }, 400);
      for (const row of Array.isArray(parsed.data) ? parsed.data : [parsed.data]) this.write(row);
      return reply([], 201);
    });
  }
}

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function column(row: CacheRow, name: string): string | null {
  if (name === "user_id") return row.user_id;
  if (name === "provider") return row.provider;
  if (name === "cache_key") return row.cache_key;
  return null;
}

const NON_FILTERS = new Set(["select", "on_conflict", "order", "limit", "offset", "columns"]);

function matches(row: CacheRow, url: URL): boolean {
  for (const [name, value] of url.searchParams) {
    if (NON_FILTERS.has(name)) continue;
    if (column(row, name) !== (value.startsWith("eq.") ? value.slice(3) : value)) return false;
  }
  return true;
}

function project(row: CacheRow, select: string | null): Record<string, unknown> {
  const full: Record<string, unknown> = { ...row };
  if (!select) return full;
  const out: Record<string, unknown> = {};
  for (const name of select.split(",").map((part) => part.trim())) {
    if (name in full) out[name] = full[name];
  }
  return out;
}

// -- Connections and context -------------------------------------------------

/**
 * One connection row, with its secret encrypted the way the table holds it.
 *
 * The plaintext is a fixture string with no meaning: nothing here asserts on
 * it, and `assertNoCredential` proves no page carries it either.
 */
export async function connectionRow(
  overrides: Partial<ConnectionRow> = {},
): Promise<ConnectionRow> {
  const provider = overrides.provider ?? "google";
  Deno.env.set(KEY_ENV, TEST_KEY);
  const encrypted = await encryptProviderToken(fixtureCredential(provider), {
    userId: USER_ID,
    provider,
  });
  return {
    provider,
    access_token_enc: encrypted,
    refresh_token_enc: null,
    expires_at: null,
    status: "active",
    meta: null,
    ...overrides,
  };
}

function fixtureCredential(provider: string): string {
  return `fixture-${provider}-credential-value`;
}

export interface ContextOverrides extends Partial<Omit<BuildContext, "deps">> {
  cache?: FakeCache;
  fetch?: typeof fetch;
  timeZone?: string;
}

export function contextFor(overrides: ContextOverrides = {}): BuildContext {
  const now = overrides.now ?? NOW;
  const rows = overrides.rows ?? [];
  const cache = overrides.cache ?? new FakeCache();
  return {
    db: overrides.db ?? cache.client,
    userId: overrides.userId ?? USER_ID,
    settings: overrides.settings ?? {},
    rows,
    connected: overrides.connected ?? activeProviders(rows),
    deps: {
      fetch: overrides.fetch ?? noFetch,
      now,
      timeZone: overrides.timeZone ?? TIME_ZONE,
    },
    now,
  };
}

// -- Reading a payload -------------------------------------------------------
//
// A page's data is Record<string, unknown> by design, so a test reads one out
// with a check rather than an assertion. A wrong shape fails the test it is
// in, which is what a cast would have hidden.

export function text(value: unknown): string {
  if (typeof value !== "string") throw new Error(`expected a string, got ${typeof value}`);
  return value;
}

export function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error(`expected a list, got ${typeof value}`);
  return value;
}

export function fields(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`expected an object, got ${typeof value}`);
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) out[key] = child;
  return out;
}

/**
 * Nothing a builder hands the badge may contain a decrypted credential.
 *
 * Asserts absence only: no test in these suites reads a token value.
 */
export function assertNoCredential(page: PagePayload, providers: string[]): void {
  const serialised = JSON.stringify(page);
  for (const provider of providers) {
    if (serialised.includes(fixtureCredential(provider))) {
      throw new Error(`page ${page.slug} carries the ${provider} credential`);
    }
  }
}
