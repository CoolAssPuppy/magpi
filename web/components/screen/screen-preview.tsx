import { TITLE_MAX } from "@/lib/badge-constants";

import { Screen, StatusBar } from "./screen";

export interface NextThingData {
  title: string;
  clockRange: string;
  location: string | null;
  minutesUntil: number;
  hasMore: boolean;
}

const SAMPLE: NextThingData = {
  title: "Platform review with the storage team",
  clockRange: "09:54 - 10:30",
  location: "MEET",
  minutesUntil: 12,
  hasMore: true,
};

/**
 * Wrap a title the way the device does: two lines at most, broken on a space,
 * truncated at TITLE_MAX before it ever reaches here.
 *
 * Python's `int()` truncates where `Math.round` does not, so every division in
 * a layout ported from a page module uses Math.floor.
 */
export function wrapTitle(title: string, columns: number): string[] {
  const words = title.slice(0, TITLE_MAX).split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= columns) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === 2) break;
  }
  if (current && lines.length < 2) lines.push(current);
  return lines.slice(0, 2);
}

/**
 * The next thing page, at true size.
 *
 * Minutes until fills the upper half, the title wraps to two lines beneath it,
 * and the clock and location sit under that. The device draws the same layout
 * in Python; `web/tests/fixtures/preview-fixtures.json` is what keeps the two
 * from drifting.
 */
export function ScreenPreview({ data = SAMPLE }: { page?: string; data?: NextThingData }) {
  const lines = wrapTitle(data.title, 20);

  return (
    <Screen>
      <StatusBar page="NEXT" clock="09:42" ageLabel="4s" power="USB" />
      <div className="gap-sm px-lg pt-lg flex items-baseline">
        <span className="font-screen leading-flat text-screen-ink text-5xl font-bold">
          {data.minutesUntil}
        </span>
        <span className="font-screen text-md tracking-label text-screen-accent">MIN</span>
      </div>
      <div className="gap-3xs px-lg pt-md flex flex-col">
        {lines.map((line) => (
          <span key={line} className="font-screen text-md text-screen-ink leading-snug">
            {line}
          </span>
        ))}
      </div>
      <div className="px-lg pt-md font-screen text-2xs text-screen-dim flex items-center justify-between">
        <span>
          {data.clockRange}
          {data.location ? ` · ${data.location}` : ""}
        </span>
        {data.hasMore ? <span className="text-screen-accent">A: NEXT 3</span> : null}
      </div>
    </Screen>
  );
}
