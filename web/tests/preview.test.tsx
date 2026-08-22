import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BadgePreview } from "@/components/screen/badge-preview";
import { PAGE_SLUGS, SCREEN_H, SCREEN_W } from "@/lib/badge-constants";
import { FIXTURES, knownSlugs, ledsFor, opsFor, stateOpsFor } from "@/lib/preview/fixtures";
import { blockWidth } from "@/lib/preview/types";

const STATES = ["ok", "empty", "not_connected", "error"] as const;

describe("the recorded fixtures", () => {
  it("cover every page the device knows", () => {
    expect(knownSlugs().sort()).toEqual([...PAGE_SLUGS].sort());
  });

  it("agree with the device about the screen size", () => {
    expect(FIXTURES.screen).toEqual({ w: SCREEN_W, h: SCREEN_H });
  });

  it("carry the ROM font metrics the previews render at", () => {
    expect(FIXTURES.fonts).toEqual({
      ark: 11,
      sins: 12,
      badgeware: 14,
      memo: 15,
      smart: 16,
      badgewaremax: 20,
    });
  });

  it("record every page in all four states, and none of them is blank", () => {
    for (const slug of PAGE_SLUGS) {
      for (const state of STATES) {
        const ops = stateOpsFor(slug, state);
        expect(ops.length, `${slug} drew nothing in the ${state} state`).toBeGreaterThan(0);
      }
    }
  });

  it("keep every drawn string inside the screen", () => {
    for (const slug of PAGE_SLUGS) {
      for (const op of opsFor(slug)) {
        if (op.op === "text") {
          expect(op.x, `${slug} drew text off the left edge`).toBeGreaterThanOrEqual(0);
          expect(op.y, `${slug} drew text below the screen`).toBeLessThan(SCREEN_H);
        }
        if (op.op === "block") {
          const right = op.x + blockWidth(op.text, op.cell);
          expect(right, `${slug} drew "${op.text}" past the right edge`).toBeLessThanOrEqual(
            SCREEN_W,
          );
        }
      }
    }
  });

  it("keep every drawn box inside the screen", () => {
    for (const slug of PAGE_SLUGS) {
      for (const op of opsFor(slug)) {
        if (op.op !== "rect") continue;
        expect(op.x + op.w, `${slug} drew a box past the right edge`).toBeLessThanOrEqual(SCREEN_W);
        expect(op.y + op.h, `${slug} drew a box past the bottom`).toBeLessThanOrEqual(SCREEN_H);
      }
    }
  });

  it("give four LED levels, in range, for every page that lights them", () => {
    for (const slug of PAGE_SLUGS) {
      const levels = ledsFor(slug);
      expect(levels).toHaveLength(4);
      for (const level of levels) {
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("the next thing page", () => {
  it("draws the minutes as the headline", () => {
    const ops = opsFor("next_thing", "typical");
    const headline = ops.find((op) => op.op === "block");
    expect(headline).toMatchObject({ text: "12" });
  });

  it("wraps a long title to two lines and no more", () => {
    const ops = opsFor("next_thing", "long_title");
    const lines = ops.filter((op) => op.op === "text" && op.size === 16 && op.x === 8);
    expect(lines.length).toBeLessThanOrEqual(2);
  });

  it("reads NOW once the meeting has started", () => {
    const ops = opsFor("next_thing", "imminent");
    expect(ops.find((op) => op.op === "block")).toMatchObject({ text: "NOW" });
  });

  it("ramps the LEDs as the meeting gets close", () => {
    // Twelve minutes is inside the fifteen minute threshold and outside the
    // five minute one.
    expect(ledsFor("next_thing", "typical")).toEqual([0.25, 0.25, 0.25, 0.25]);
    // Four hours out, and the LEDs stay dark.
    expect(ledsFor("next_thing", "long_title")).toEqual([0, 0, 0, 0]);
  });
});

describe("the deploys page", () => {
  it("puts the worst state in the band", () => {
    const ops = opsFor("deploys", "typical");
    expect(ops.find((op) => op.op === "block")).toMatchObject({ text: "ERROR" });
  });

  it("lights the LEDs fully on an error", () => {
    expect(ledsFor("deploys", "typical")).toEqual([1, 1, 1, 1]);
  });

  it("leaves them dark when everything is ready", () => {
    expect(ledsFor("deploys", "all_ready")).toEqual([0, 0, 0, 0]);
  });
});

describe("the one number page", () => {
  it("shrinks the headline so a longer number still fits", () => {
    const typical = opsFor("one_number", "typical").find((op) => op.op === "block");
    const big = opsFor("one_number", "big_value").find((op) => op.op === "block");
    expect(typical?.op === "block" && big?.op === "block").toBe(true);
    if (typical?.op !== "block" || big?.op !== "block") return;
    expect(big.cell).toBeLessThan(typical.cell);
    expect(big.x + blockWidth(big.text, big.cell)).toBeLessThanOrEqual(SCREEN_W);
  });
});

describe("BadgePreview", () => {
  it("renders at exactly the badge's size", () => {
    render(<BadgePreview ops={opsFor("next_thing")} />);
    const preview = screen.getByTestId("badge-preview");
    expect(preview).toHaveStyle({ width: `${SCREEN_W}px`, height: `${SCREEN_H}px` });
  });

  it("draws every recorded string", () => {
    render(<BadgePreview ops={opsFor("next_thing", "typical")} />);
    expect(screen.getAllByText("Platform review").length).toBeGreaterThan(0);
    expect(screen.getByText("MIN")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("carries the pen forward the way the device does", () => {
    render(
      <BadgePreview
        ops={[
          { op: "pen", value: "rgb(15, 191, 168)" },
          { op: "text", text: "LIVE", x: 4, y: 4, size: 11 },
          { op: "text", text: "DIM", x: 4, y: 20, size: 11 },
        ]}
      />,
    );
    expect(screen.getByText("LIVE")).toHaveStyle({ color: "rgb(15, 191, 168)" });
    expect(screen.getByText("DIM")).toHaveStyle({ color: "rgb(15, 191, 168)" });
  });

  it("renders an empty operation list without failing", () => {
    render(<BadgePreview ops={[]} />);
    expect(screen.getByTestId("badge-preview")).toBeInTheDocument();
  });

  it("names the screen for a reader who cannot see it", () => {
    render(<BadgePreview ops={opsFor("next_thing")} label="Next thing, on the badge" />);
    expect(screen.getByRole("img", { name: "Next thing, on the badge" })).toBeInTheDocument();
  });
});
