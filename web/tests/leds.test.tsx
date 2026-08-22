import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LedRow } from "@/components/screen/leds";
import { LED_LEVELS } from "@/lib/badge-constants";

function lamps(): HTMLElement[] {
  const row = screen.getByLabelText("Case LEDs");
  return Array.from(row.querySelectorAll<HTMLElement>("[data-level]"));
}

describe("LedRow", () => {
  it("shows one lamp per LED on the case", () => {
    render(<LedRow levels={[1, 1, 1, 1]} />);
    expect(lamps()).toHaveLength(LED_LEVELS);
  });

  it("draws a lit lamp at the brightness the page asked for", () => {
    render(<LedRow levels={[0.25, 0.5, 0.75, 1]} />);
    const [first, , , last] = lamps();
    expect(first).toHaveStyle({ opacity: "0.25" });
    expect(last).toHaveStyle({ opacity: "1" });
  });

  it("draws a lamp the page left dark, rather than dropping it", () => {
    render(<LedRow levels={[0, 0, 0, 0]} />);
    expect(lamps()).toHaveLength(LED_LEVELS);
    for (const lamp of lamps()) expect(lamp).toHaveAttribute("data-level", "0");
  });

  it("fills the case out when a page names fewer levels than there are LEDs", () => {
    render(<LedRow levels={[1]} />);
    const shown = lamps().map((lamp) => lamp.getAttribute("data-level"));
    expect(shown).toEqual(["1", "0", "0", "0"]);
  });

  it("shows no more lamps than the case has, however many levels arrive", () => {
    render(<LedRow levels={[1, 1, 1, 1, 1, 1]} />);
    expect(lamps()).toHaveLength(LED_LEVELS);
  });

  it("says what the row is, for a reader who cannot see it", () => {
    render(<LedRow levels={[0, 0, 0, 0]} />);
    expect(screen.getByLabelText("Case LEDs")).toBeInTheDocument();
  });
});
