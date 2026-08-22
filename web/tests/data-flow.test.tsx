import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataFlow } from "@/components/data-flow";

const TRUNK_CLASS = "wire-packet-trunk";

function packetsIn(container: HTMLElement): Element[] {
  return [...container.querySelectorAll(".wire-packet")];
}

describe("the converging wires diagram", () => {
  it("draws one lane per provider by default", () => {
    const { container } = render(<DataFlow />);

    expect(container.querySelectorAll("g")).toHaveLength(5);
  });

  it("draws as many lanes as the page has providers", () => {
    const { container } = render(<DataFlow lanes={3} />);

    expect(container.querySelectorAll("g")).toHaveLength(3);
  });

  it("gives each lane a wire and a packet riding it", () => {
    const { container } = render(<DataFlow lanes={4} />);

    for (const lane of container.querySelectorAll("g")) {
      const paths = lane.querySelectorAll("path");
      expect(paths).toHaveLength(2);
      expect(paths[1]).toHaveClass("wire-packet");
    }
  });

  it("sends a packet down the trunk as well as down every lane", () => {
    const { container } = render(<DataFlow lanes={4} />);
    const packets = packetsIn(container);

    expect(packets).toHaveLength(5);
    expect(packets.filter((packet) => packet.classList.contains(TRUNK_CLASS))).toHaveLength(1);
  });

  it("staggers the lanes so the packets never arrive together", () => {
    const { container } = render(<DataFlow lanes={3} />);
    const delays = packetsIn(container)
      .filter((packet) => !packet.classList.contains(TRUNK_CLASS))
      .map((packet) => packet.getAttribute("style"));

    expect(delays).toEqual([
      "animation-delay: calc(var(--duration-wire) / 3 * 0);",
      "animation-delay: calc(var(--duration-wire) / 3 * 1);",
      "animation-delay: calc(var(--duration-wire) / 3 * 2);",
    ]);
  });

  it("spreads the lanes evenly down the left edge", () => {
    const { container } = render(<DataFlow lanes={2} />);
    const wires = [...container.querySelectorAll("g > path")].map((path) => path.getAttribute("d"));

    expect(wires).toEqual([
      "M0 60 L268 120",
      "M0 60 L268 120",
      "M0 180 L268 120",
      "M0 180 L268 120",
    ]);
  });

  it("joins every lane at a single marked junction", () => {
    const { container } = render(<DataFlow />);
    const junction = container.querySelector("circle");

    expect(junction).toHaveAttribute("cx", "268");
    expect(junction).toHaveAttribute("cy", "120");
  });

  it("is skipped by screen readers, being a picture of what the page says in words", () => {
    const { container } = render(<DataFlow />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("role", "presentation");
  });

  it("draws nothing but the trunk when there are no providers to converge", () => {
    const { container } = render(<DataFlow lanes={0} />);

    expect(container.querySelectorAll("g")).toHaveLength(0);
    expect(packetsIn(container)).toHaveLength(1);
  });
});
