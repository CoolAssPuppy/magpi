import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Screen, StatusBar, type StatusBarProps } from "@/components/screen/screen";
import { SCREEN_H, SCREEN_W } from "@/lib/badge-constants";

function statusBarProps(overrides: Partial<StatusBarProps> = {}): StatusBarProps {
  return {
    page: "Next thing",
    clock: "09:41",
    ageLabel: "12s",
    power: "84%",
    ...overrides,
  };
}

describe("Screen", () => {
  it("renders at the badge's true size, so a title that overflows shows it", () => {
    render(
      <Screen>
        <span>Platform review</span>
      </Screen>,
    );
    expect(screen.getByTestId("badge-screen")).toHaveStyle({
      width: `${SCREEN_W}px`,
      height: `${SCREEN_H}px`,
    });
  });

  it("shows what the page put on it", () => {
    render(
      <Screen>
        <span>Platform review</span>
      </Screen>,
    );
    expect(screen.getByText("Platform review")).toBeInTheDocument();
  });

  it("renders with nothing on it", () => {
    render(<Screen>{null}</Screen>);
    expect(screen.getByTestId("badge-screen")).toBeEmptyDOMElement();
  });
});

describe("StatusBar", () => {
  it("names the page the badge is showing", () => {
    render(<StatusBar {...statusBarProps({ page: "Deploys" })} />);
    expect(screen.getByText("Deploys")).toBeInTheDocument();
  });

  it("shows the clock", () => {
    render(<StatusBar {...statusBarProps({ clock: "17:05" })} />);
    expect(screen.getByText("17:05")).toBeInTheDocument();
  });

  it("puts the data age next to the power reading", () => {
    render(<StatusBar {...statusBarProps({ ageLabel: "4m", power: "CHG" })} />);
    expect(screen.getByText(/4m/)).toHaveTextContent("4m · CHG");
  });
});
