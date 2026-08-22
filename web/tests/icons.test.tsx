import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PencilIcon, RefreshIcon, TrashIcon } from "@/components/icons";

const ICONS = [
  ["pencil", PencilIcon],
  ["refresh", RefreshIcon],
  ["trash", TrashIcon],
] as const;

describe("the row action icons", () => {
  for (const [name, Icon] of ICONS) {
    it(`draws the ${name}`, () => {
      const { container } = render(<Icon />);
      const svg = container.querySelector("svg");

      expect(svg).toBeInTheDocument();
      expect(svg?.querySelectorAll("path").length).toBeGreaterThan(0);
    });

    it(`hides the ${name} from a screen reader, because its button is named`, () => {
      const { container } = render(<Icon />);

      // An icon inside a labelled button announced twice is worse than silent.
      expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    });

    it(`takes its colour from the text around it, in the ${name}`, () => {
      const { container } = render(<Icon />);

      // currentColor, so hover and the muted state need no second rule.
      expect(container.querySelector("svg")).toHaveAttribute("stroke", "currentColor");
    });

    it(`sits on a 14px line, in the ${name}`, () => {
      const { container } = render(<Icon />);
      const svg = container.querySelector("svg");

      expect(svg).toHaveAttribute("width", "14");
      expect(svg).toHaveAttribute("viewBox", "0 0 14 14");
    });
  }
});
