import { CHART_COLORS } from './palette';

export type RankedItem = {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly caption?: string;
};

/** Horizontal bars for nominal categories, so long labels stay readable. Every bar is one color. */
export function RankedBars({
  items,
  valueLabel,
}: {
  items: readonly RankedItem[];
  valueLabel: string;
}) {
  const ceiling = Math.max(...items.map((item) => item.value), 1);

  return (
    <ol className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1.5">
          <p
            className="max-w-[var(--measure-prose)] truncate text-sm text-foreground"
            title={item.label}
          >
            {item.label}
          </p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {item.value.toLocaleString('en-US')}
            <span className="sr-only"> {valueLabel}</span>
          </p>
          <div
            className="col-span-2 h-1.5 rounded-full bg-secondary"
            role="img"
            aria-label={`${item.value.toLocaleString('en-US')} ${valueLabel}`}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${(item.value / ceiling) * 100}%`,
                backgroundColor: CHART_COLORS.accent,
              }}
            />
          </div>
          {item.caption ? (
            <p className="col-span-2 text-xs text-tertiary-foreground">{item.caption}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
