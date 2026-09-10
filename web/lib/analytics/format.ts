/** All dates render in UTC, because the analytics window is bucketed by UTC day. */
const DAY_LABEL = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const DAY_CAPTION = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatDayLabel(day: string): string {
  return DAY_LABEL.format(new Date(`${day}T00:00:00.000Z`));
}

export function formatDayCaption(day: string): string {
  return DAY_CAPTION.format(new Date(`${day}T00:00:00.000Z`));
}

const UNITS = [
  { limit: 86_400_000, name: 'day' },
  { limit: 3_600_000, name: 'hour' },
  { limit: 60_000, name: 'minute' },
] as const;

export function formatSince(iso: string | null, now: Date): string {
  if (iso === null) return 'Never';

  const elapsed = now.getTime() - new Date(iso).getTime();

  for (const unit of UNITS) {
    const count = Math.floor(elapsed / unit.limit);
    if (count >= 1) return `${count} ${unit.name}${count === 1 ? '' : 's'} ago`;
  }

  return 'just now';
}

/** Decimal units, the way storage is sold and the way a bill reads. */
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${Math.round(bytes)} B`;

  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < BYTE_UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }

  return `${value.toFixed(1).replace(/\.0$/, '')} ${BYTE_UNITS[unit]}`;
}
