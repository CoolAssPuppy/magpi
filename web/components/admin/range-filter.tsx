import Link from 'next/link';

import { cn } from '@/lib/utils';

const RANGE_OPTIONS = [7, 30, 90] as const;
export type RangeDays = (typeof RANGE_OPTIONS)[number];

const DEFAULT_RANGE: RangeDays = 30;

export function parseRange(value: string | undefined): RangeDays {
  const parsed = Number(value);
  return RANGE_OPTIONS.find((option) => option === parsed) ?? DEFAULT_RANGE;
}

/**
 * One filter row above everything it scopes, and it is a set of links rather
 * than a control with state, so it renders on the server and survives every
 * loading, empty and error state below it.
 */
export function RangeFilter({ basePath, active }: { basePath: string; active: RangeDays }) {
  return (
    <nav aria-label="Time range" className="flex items-center gap-1">
      {RANGE_OPTIONS.map((option) => (
        <Link
          key={option}
          href={{ pathname: basePath, query: { days: option } }}
          aria-current={option === active ? 'true' : undefined}
          className={cn(
            'rounded-[var(--radius-panel)] px-2.5 py-1 text-xs transition-colors motion-reduce:transition-none',
            option === active
              ? 'bg-background-surface-300 text-foreground'
              : 'text-foreground-lighter hover:text-foreground',
          )}
        >
          {option} days
        </Link>
      ))}
    </nav>
  );
}
