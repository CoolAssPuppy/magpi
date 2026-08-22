import { describe, expect, it } from "vitest";

import { PAGE_SLUGS } from "@/lib/badge-constants";
import { FIXTURES, knownSlugs, ledsFor, opsFor, pageNames, stateOpsFor } from "@/lib/preview/fixtures";

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
    const cases = Object.keys(FIXTURES.pages.next_thing.cases);
    expect(opsFor("next_thing", cases[0])).toEqual(FIXTURES.pages.next_thing.cases[cases[0]].draw);
  });

  it("falls back to the empty state when the case was never recorded", () => {
    expect(opsFor("next_thing", "a case nobody recorded")).toEqual(
      FIXTURES.pages.next_thing.states.empty,
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
    expect(stateOpsFor("next_thing", "empty")).toEqual(FIXTURES.pages.next_thing.states.empty);
  });
});

describe("the LED levels a page asks for", () => {
  it("uses the levels the recording captured", () => {
    expect(ledsFor("next_thing")).toEqual(FIXTURES.pages.next_thing.cases.typical.leds);
  });

  it("leaves all four dark for a page or case with no recording", () => {
    expect(ledsFor("not_a_page")).toEqual([0, 0, 0, 0]);
    expect(ledsFor("next_thing", "a case nobody recorded")).toEqual([0, 0, 0, 0]);
  });
});
