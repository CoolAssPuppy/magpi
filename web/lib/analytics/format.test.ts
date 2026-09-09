import { describe, expect, it } from 'vitest';

import { formatDayCaption, formatDayLabel, formatSince } from './format';

const NOW = new Date('2026-09-09T14:20:00.000Z');

describe('day labels', () => {
  it('shortens a day for an axis and spells it out for a table', () => {
    expect(formatDayLabel('2026-09-09')).toBe('Sep 9');
    expect(formatDayCaption('2026-09-09')).toBe('9 September 2026');
  });
});

describe('how long ago', () => {
  it('counts in the largest unit that still reads as a number', () => {
    expect(formatSince('2026-09-09T14:19:30.000Z', NOW)).toBe('just now');
    expect(formatSince('2026-09-09T13:20:00.000Z', NOW)).toBe('1 hour ago');
    expect(formatSince('2026-09-09T11:20:00.000Z', NOW)).toBe('3 hours ago');
    expect(formatSince('2026-09-07T14:20:00.000Z', NOW)).toBe('2 days ago');
    expect(formatSince('2026-09-09T14:15:00.000Z', NOW)).toBe('5 minutes ago');
  });

  it('says never rather than showing a blank where a sync has not happened', () => {
    expect(formatSince(null, NOW)).toBe('Never');
  });
});
