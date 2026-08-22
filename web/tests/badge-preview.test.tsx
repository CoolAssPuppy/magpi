import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BadgePreview } from "@/components/screen/badge-preview";
import { blockWidth, type DrawOp } from "@/lib/preview/types";

function boxes(): HTMLElement[] {
  const preview = screen.getByTestId("badge-preview");
  return Array.from(preview.querySelectorAll<HTMLElement>("span.absolute:not(.whitespace-pre)"));
}

type RectOp = Extract<DrawOp, { op: "rect" }>;

function rect(overrides: Partial<Omit<RectOp, "op">> = {}): RectOp {
  return { op: "rect", x: 0, y: 16, w: 160, h: 81, ...overrides };
}

describe("BadgePreview drawing a box", () => {
  it("puts the box where the device drew it", () => {
    render(<BadgePreview ops={[rect({ x: 12, y: 40, w: 96, h: 8 })]} />);
    const [box] = boxes();
    expect(box).toHaveStyle({ left: "12px", top: "40px", width: "96px", height: "8px" });
  });

  it("fills the box with the pen in force when the device drew it", () => {
    render(
      <BadgePreview
        ops={[
          { op: "pen", value: "rgb(23, 23, 23)" },
          rect(),
          { op: "pen", value: "rgb(42, 42, 42)" },
          rect({ y: 96, h: 1 }),
        ]}
      />,
    );
    const [panel, rule] = boxes();
    expect(panel).toHaveStyle({ backgroundColor: "rgb(23, 23, 23)" });
    expect(rule).toHaveStyle({ backgroundColor: "rgb(42, 42, 42)" });
  });

  it("draws a box before any pen in the screen's own foreground", () => {
    render(<BadgePreview ops={[rect()]} />);
    const [box] = boxes();
    expect(box).toHaveStyle({ backgroundColor: "var(--color-screen-ink)" });
  });

  it("keeps boxes, text and headlines in the order the device drew them", () => {
    render(
      <BadgePreview
        ops={[
          rect({ x: 0, y: 0, w: 320, h: 16 }),
          { op: "text", text: "GMAIL", x: 8, y: 24, size: 11 },
          { op: "block", text: "42", x: 8, y: 40, cell: 6 },
        ]}
      />,
    );
    const drawn = Array.from(
      screen.getByTestId("badge-preview").querySelectorAll<HTMLElement>("span"),
    );
    expect(drawn.map((node) => node.textContent)).toEqual(["", "GMAIL", "42"]);
  });
});

describe("BadgePreview drawing a headline", () => {
  it("sizes a headline to the glyph grid the device draws it from", () => {
    render(<BadgePreview ops={[{ op: "block", text: "NOW", x: 8, y: 40, cell: 6 }]} />);
    expect(screen.getByText("NOW")).toHaveStyle({
      width: `${blockWidth("NOW", 6)}px`,
      fontSize: "42px",
      letterSpacing: "6px",
    });
  });
});

describe("BadgePreview given something it cannot draw", () => {
  // The recorder emits shape operations, which the badge uses to pick a glyph
  // set. There is nothing to put on screen for one, and a preview that threw
  // on an operation it had no node for would take the whole page down.
  it("draws nothing for a shape operation and keeps going", () => {
    render(
      <BadgePreview
        ops={[
          { op: "shape", value: "round" },
          { op: "text", text: "AFTER", x: 4, y: 4, size: 11 },
        ]}
      />,
    );
    expect(screen.getByText("AFTER")).toBeInTheDocument();
    expect(boxes()).toHaveLength(0);
  });

  it("draws nothing at all when every operation is one it has no node for", () => {
    render(<BadgePreview ops={[{ op: "shape", value: "round" }]} />);
    expect(screen.getByTestId("badge-preview")).toBeEmptyDOMElement();
  });

  it("still names the screen when there is nothing on it", () => {
    render(<BadgePreview ops={[]} />);
    expect(screen.getByRole("img", { name: "Badge screen" })).toBeInTheDocument();
  });
});
