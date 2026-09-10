/** Plot geometry, kept apart from the drawing components. One y axis from zero per chart. */

/** 1, 2, 2.5, 5 and 10 are the multipliers a reader divides in their head. */
const STEPS = [1, 2, 2.5, 5, 10] as const;

export function niceCeiling(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = STEPS.find((candidate) => normalized <= candidate) ?? 10;

  return step * magnitude;
}

export function axisTicks(ceiling: number, steps: number): readonly number[] {
  return Array.from({ length: steps + 1 }, (_, index) => (ceiling / steps) * index);
}

export function bandCenter(index: number, count: number, width: number): number {
  const band = width / count;
  return band * index + band / 2;
}

/** A bar never fills its band; the leftover is the gap between neighbours. */
export function barWidth(count: number, width: number, maxThickness: number): number {
  return Math.max(1, Math.min(maxThickness, (width / count) * 0.75));
}

export function valueToY(value: number, ceiling: number, height: number): number {
  return height - (value / ceiling) * height;
}

function round(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** A gap wherever a value is null, so a day with no measurement is not drawn as zero. */
export function seriesPath(
  values: readonly (number | null)[],
  { width, height, ceiling }: { width: number; height: number; ceiling: number },
): string {
  const segments: string[] = [];
  let open = false;

  values.forEach((value, index) => {
    if (value === null) {
      open = false;
      return;
    }

    const x = round(bandCenter(index, values.length, width));
    const y = round(valueToY(value, ceiling, height));

    if (open) segments.push(`L${x} ${y}`);
    else {
      // A run of one still needs a visible mark, so it starts and ends in place.
      const isolated = values[index + 1] === null || values[index + 1] === undefined;
      segments.push(`M${x} ${y}`);
      if (isolated) segments.push(`L${x} ${y}`);
      open = true;
    }
  });

  return segments.join('');
}

/** A stable heading id derived from the title, since server components cannot call useId. */
export function headingIdFor(title: string): string {
  return `chart-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;
}
