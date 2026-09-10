import Link from 'next/link';

import { cn } from '@/lib/utils';

const RANGE_OPTIONS = [7, 30, 90] as const;
export type RangeDays = (typeof RANGE_OPTIONS)[number];

const DEFAULT_RANGE: RangeDays = 30;

export function parseRange(value: string | undefined): RangeDays {
  const parsed = Number(value);
  return RANGE_OPTIONS.find((option) => option === parsed) ?? DEFAULT_RANGE;
}

/** A server-rendered filter row of links, with no client state. */
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
              ? 'bg-secondary text-foreground'
              : 'text-tertiary-foreground hover:text-foreground',
          )}
        >
          {option} days
        </Link>
      ))}
    </nav>
  );
}
