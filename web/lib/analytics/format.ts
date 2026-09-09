/**
 * All dates render in UTC. The analytics window is bucketed by UTC day, so
 * showing a label in the reader's local zone would put a bar under the wrong
 * date for half the world.
 */
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
