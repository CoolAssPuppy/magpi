import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FoldedMagpie, MagpieMark } from "@/components/magpie-mark";

function svgIn(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector("svg");
  if (!svg) throw new Error("no mark was drawn");
  return svg;
}

describe("the wordmark bird", () => {
  it("draws at the default size when none is asked for", () => {
    const { container } = render(<MagpieMark />);
    const svg = svgIn(container);

    expect(svg.getAttribute("width")).toBe("26");
    expect(svg.getAttribute("height")).toBe("20");
  });

  it("keeps the 26:20 proportion of the badge mark at any size", () => {
    const { container } = render(<MagpieMark size={52} />);
    const svg = svgIn(container);

    expect(svg.getAttribute("width")).toBe("52");
    expect(svg.getAttribute("height")).toBe("40");
  });

  it("is skipped by screen readers, because the name sits beside it", () => {
    const { container } = render(<MagpieMark />);
    const svg = svgIn(container);

    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("role", "presentation");
  });

  it("folds three planes, one lit, one shadowed, one accent", () => {
    const { container } = render(<MagpieMark />);
    const fills = [...container.querySelectorAll("path")].map((path) => path.getAttribute("fill"));

    expect(fills).toEqual(["var(--color-ink)", "var(--color-ink-muted)", "var(--color-accent)"]);
  });
});

describe("the hero bird", () => {
  it("takes layout classes from the page that places it", () => {
    const { container } = render(<FoldedMagpie className="h-full w-full" />);

    expect(svgIn(container)).toHaveClass("h-full", "w-full");
  });

  it("renders without a class when the caller gives none", () => {
    const { container } = render(<FoldedMagpie />);
    const svg = svgIn(container);

    expect(svg.getAttribute("class")).toBeNull();
    expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  it("is skipped by screen readers, being decoration on a page that says the same thing in words", () => {
    const { container } = render(<FoldedMagpie />);

    expect(svgIn(container)).toHaveAttribute("aria-hidden", "true");
  });

  it("creases the folds with a single stroked group", () => {
    const { container } = render(<FoldedMagpie />);
    const creases = container.querySelector('g[stroke="var(--color-paper-crease)"]');

    expect(creases?.querySelectorAll("path")).toHaveLength(5);
  });
});
