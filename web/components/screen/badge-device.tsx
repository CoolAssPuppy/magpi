import type { ReactNode } from "react";

import { SCREEN_H, SCREEN_W } from "@/lib/badge-constants";

/**
 * The Tufty 2350, drawn rather than photographed.
 *
 * A render stays on palette in both themes, scales without a second asset, and
 * carries the live screen inside it: what sits behind the bezel is the same
 * replayed page the previews use, not a picture of one.
 *
 * The shell is dark in both themes because the case is black in both themes.
 * It is a device, not a surface, so it does not take the page's background.
 */
export function BadgeDevice({
  children,
  className,
  /** Lights the case LEDs, for when the device is the subject rather than a prop. */
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={`rounded-round bg-screen-panel p-lg gap-lg flex shrink-0 flex-col ${className ?? ""}`}
    >
      <div
        className="bg-screen rounded-hairline relative overflow-hidden"
        style={{ width: SCREEN_W, height: SCREEN_H }}
      >
        {children}
      </div>

      {/* The case below the panel: three button pads, then the four LEDs. */}
      <div className="gap-md flex items-center justify-between">
        <div className="gap-sm flex items-center" aria-hidden="true">
          {["A", "B", "C"].map((button) => (
            <span key={button} className="rounded-hairline bg-screen-rule h-md w-3xl" />
          ))}
        </div>
        <div className="gap-xs flex items-center" aria-hidden="true">
          {[0, 1, 2, 3].map((led) => (
            <span
              key={led}
              className={`rounded-hairline h-md w-lg ${
                glow ? "bg-screen-accent" : "bg-screen-rule"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
