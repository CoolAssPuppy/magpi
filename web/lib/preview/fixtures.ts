import { PAGE_SLUGS } from "@/lib/badge-constants";

import fixturesJson from "@/tests/fixtures/preview-fixtures.json";

import { previewFixturesSchema, type DrawOp, type PreviewFixtures } from "./types";

/**
 * The recorded layouts, parsed once.
 *
 * A parse failure here is a build failure, which is the point: the file is
 * generated, so a shape this build does not understand means the recorder and
 * the reader have drifted, and that is exactly the drift the file exists to
 * catch.
 */
export const FIXTURES: PreviewFixtures = previewFixturesSchema.parse(fixturesJson);

export type PageSlug = (typeof PAGE_SLUGS)[number];

export function pageNames(): Record<string, string> {
  const names: Record<string, string> = {};
  for (const [slug, page] of Object.entries(FIXTURES.pages)) names[slug] = page.name;
  return names;
}

/** The operations for one page in one recorded case, or its empty state. */
export function opsFor(slug: string, caseName = "typical"): DrawOp[] {
  const page = FIXTURES.pages[slug];
  if (!page) return [];
  return page.cases[caseName]?.draw ?? page.states.empty ?? [];
}

/** The operations for a page in one of its four states. */
export function stateOpsFor(slug: string, state: string): DrawOp[] {
  return FIXTURES.pages[slug]?.states[state] ?? [];
}

/** The LED levels a page asks for in a recorded case, or four dark ones. */
export function ledsFor(slug: string, caseName = "typical"): number[] {
  return FIXTURES.pages[slug]?.cases[caseName]?.leds ?? [0, 0, 0, 0];
}

/** Every slug the device can draw, in the order the constants declare. */
export function knownSlugs(): string[] {
  return PAGE_SLUGS.filter((slug) => slug in FIXTURES.pages);
}
