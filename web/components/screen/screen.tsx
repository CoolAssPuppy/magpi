import type { ReactNode } from "react";

import { SCREEN_H, SCREEN_W } from "@/lib/badge-constants";

/**
 * The badge LCD at true size, in the badge's own palette.
 *
 * Fixed at 320 by 240 rather than scaled, because a preview at 80 percent is a
 * preview that lies about whether a title fits. The palette does not follow the
 * site theme: the badge has no light mode, and a preview that recoloured itself
 * would be lying about what you will see on the desk.
 */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <div
      className="bg-screen font-screen flex flex-col overflow-hidden"
      style={{ width: SCREEN_W, height: SCREEN_H }}
      data-testid="badge-screen"
    >
      {children}
    </div>
  );
}

export interface StatusBarProps {
  page: string;
  clock: string;
  ageLabel: string;
  power: string;
}

/** Page name left, clock in the middle, battery and data age on the right. */
export function StatusBar({ page, clock, ageLabel, power }: StatusBarProps) {
  return (
    <div className="h-lg border-screen-rule bg-screen-panel px-sm font-screen text-2xs text-screen-dim flex shrink-0 items-center justify-between border-b">
      <span className="text-screen-ink">{page}</span>
      <span>{clock}</span>
      <span>
        {ageLabel} &middot; {power}
      </span>
    </div>
  );
}
