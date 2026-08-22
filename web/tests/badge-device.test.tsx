import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BadgeDevice } from "@/components/screen/badge-device";
import { SCREEN_H, SCREEN_W } from "@/lib/badge-constants";

describe("the badge, drawn", () => {
  it("puts whatever it is given behind the bezel", () => {
    render(
      <BadgeDevice>
        <p>Next thing</p>
      </BadgeDevice>,
    );

    expect(screen.getByText("Next thing")).toBeInTheDocument();
  });

  it("holds the screen at the size the device actually has", () => {
    const { container } = render(
      <BadgeDevice>
        <p>screen</p>
      </BadgeDevice>,
    );

    const panel = screen.getByText("screen").parentElement;
    expect(panel).toHaveStyle({ width: `${SCREEN_W}px`, height: `${SCREEN_H}px` });
    expect(container.firstChild).toBeInTheDocument();
  });

  it("draws the case controls, and hides them from a screen reader", () => {
    const { container } = render(
      <BadgeDevice>
        <p>screen</p>
      </BadgeDevice>,
    );

    // Three button pads and four LEDs are decoration: the device is a picture,
    // and a reader announcing seven empty spans would be noise.
    const hidden = container.querySelectorAll('[aria-hidden="true"]');
    expect(hidden.length).toBeGreaterThanOrEqual(2);
  });

  it("lights the LEDs only when asked", () => {
    const { container: dark } = render(
      <BadgeDevice>
        <p>a</p>
      </BadgeDevice>,
    );
    const { container: lit } = render(
      <BadgeDevice glow>
        <p>b</p>
      </BadgeDevice>,
    );

    expect(dark.innerHTML).not.toContain("bg-screen-accent");
    expect(lit.innerHTML).toContain("bg-screen-accent");
  });

  it("takes an extra class, so a caller can cap its width on a phone", () => {
    const { container } = render(
      <BadgeDevice className="max-w-full">
        <p>screen</p>
      </BadgeDevice>,
    );

    expect((container.firstChild as HTMLElement).className).toContain("max-w-full");
  });
});
