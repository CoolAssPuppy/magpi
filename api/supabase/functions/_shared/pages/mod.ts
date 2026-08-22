// One builder per page, and the map that registers them.
//
// Adding a page is one file here, one entry in the map below, one module under
// device/notifier-app/pages/, and one entry in PAGE_SLUGS. Nothing else.

import type { SupabaseClient } from "@supabase/supabase-js";

import { PAGE_SLUGS } from "../badge-constants.ts";
import type { ConnectionRow } from "../connections.ts";
import { errorPage, notConnectedPage, type PagePayload } from "../envelope.ts";
import type { FetchDeps } from "../sources/contract.ts";

import * as counters from "./counters.ts";
import * as dayShape from "./day_shape.ts";
import * as deploys from "./deploys.ts";
import * as nextThing from "./next_thing.ts";
import * as oneNumber from "./one_number.ts";

export interface BuildContext {
  db: SupabaseClient;
  userId: string;
  /** Whatever the user configured for this page on the website. */
  settings: Record<string, unknown>;
  /** Every connection this user holds. Decrypted one at a time, on demand. */
  rows: ConnectionRow[];
  /** Which providers can answer right now. */
  connected: Set<string>;
  deps: FetchDeps;
  now: Date;
}

export interface PageBuilder {
  slug: string;
  /** The providers this page cannot draw without. */
  requires: string[];
  build(ctx: BuildContext): Promise<PagePayload>;
}

const BUILDERS: PageBuilder[] = [nextThing, dayShape, deploys, counters, oneNumber];

export const REGISTRY = new Map(BUILDERS.map((builder) => [builder.slug, builder]));

export function get(slug: string): PageBuilder | undefined {
  return REGISTRY.get(slug);
}

/**
 * Build one page, turning every failure into that page's own error state.
 *
 * A dead provider never fails the request and never blanks the screen. This is
 * the only place that guarantee is enforced, so a builder is free to throw.
 */
export async function buildPage(slug: string, ctx: BuildContext): Promise<PagePayload | null> {
  const builder = get(slug);
  if (!builder) return null;

  const missing = builder.requires.filter((provider) => !ctx.connected.has(provider));
  if (missing.length > 0) return notConnectedPage(slug);

  try {
    return await builder.build(ctx);
  } catch (error) {
    return errorPage(slug, error instanceof Error ? error.message : "that source did not answer");
  }
}

/** Every slug the device knows, so the two halves cannot drift. */
export const KNOWN_SLUGS: readonly string[] = PAGE_SLUGS;
