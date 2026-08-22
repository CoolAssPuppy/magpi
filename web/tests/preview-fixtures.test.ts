import { describe, expect, it } from "vitest";

import { PAGE_SLUGS } from "@/lib/badge-constants";
import {
  FIXTURES,
  knownSlugs,
  ledsFor,
  opsFor,
  pageNames,
  stateOpsFor,
} from "@/lib/preview/fixtures";

/**
 * One recorded page, or a failure naming the slug. The fixtures are generated,
 * so a missing page is a recorder that has drifted, not a case to tolerate.
 */
function pageFixture(slug: string) {
  const page = FIXTURES.pages[slug];
  if (!page) throw new Error(`no recording for ${slug}`);
  return page;
}

function caseFixture(slug: string, caseName: string) {
  const recorded = pageFixture(slug).cases[caseName];
  if (!recorded) throw new Error(`no ${caseName} case recorded for ${slug}`);
  return recorded;
}

describe("the recorded layouts", () => {
  it("holds a recording for every page the device can draw", () => {
    expect(knownSlugs()).toEqual([...PAGE_SLUGS]);
  });

  it("names every page, so the web never invents a label the badge does not use", () => {
    const names = pageNames();

    expect(Object.keys(names).sort()).toEqual([...PAGE_SLUGS].sort());
    for (const name of Object.values(names)) expect(name.length).toBeGreaterThan(0);
  });
});

describe("the operations for a page", () => {
  it("replays the typical case by default", () => {
    expect(opsFor("next_thing").length).toBeGreaterThan(0);
  });

  it("replays a named case when one is asked for", () => {
    const [name] = Object.keys(pageFixture("next_thing").cases);
    if (!name) throw new Error("next_thing has no recorded cases");

    expect(opsFor("next_thing", name)).toEqual(caseFixture("next_thing", name).draw);
  });

  it("falls back to the empty state when the case was never recorded", () => {
    expect(opsFor("next_thing", "a case nobody recorded")).toEqual(
      pageFixture("next_thing").states.empty,
    );
  });

  it("draws nothing for a slug the device does not know", () => {
    expect(opsFor("not_a_page")).toEqual([]);
    expect(stateOpsFor("not_a_page", "empty")).toEqual([]);
  });

  it("draws nothing for a state that was never recorded", () => {
    expect(stateOpsFor("next_thing", "not_a_state")).toEqual([]);
  });

  it("replays a recorded state", () => {
    expect(stateOpsFor("next_thing", "empty")).toEqual(pageFixture("next_thing").states.empty);
  });
});

describe("the LED levels a page asks for", () => {
  it("uses the levels the recording captured", () => {
    expect(ledsFor("next_thing")).toEqual(caseFixture("next_thing", "typical").leds);
  });

  it("leaves all four dark for a page or case with no recording", () => {
    expect(ledsFor("not_a_page")).toEqual([0, 0, 0, 0]);
    expect(ledsFor("next_thing", "a case nobody recorded")).toEqual([0, 0, 0, 0]);
  });
});
