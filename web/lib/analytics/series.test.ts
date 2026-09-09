import { describe, expect, it } from 'vitest';

import {
  bucketByDay,
  groupQuestions,
  normalizeQuestion,
  percentile,
  type LatencySample,
  type QuestionRow,
} from './series';

const NOW = new Date('2026-09-09T14:20:00.000Z');

function sample(overrides?: Partial<LatencySample>): LatencySample {
  return { occurredAt: '2026-09-09T09:00:00.000Z', latencyMs: 400, ...overrides };
}

function questionRow(overrides?: Partial<QuestionRow>): QuestionRow {
  return {
    content: 'Where is the deploy runbook?',
    createdAt: '2026-09-09T09:00:00.000Z',
    ...overrides,
  };
}

describe('percentile', () => {
  it('reads the value at the requested rank', () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(20);
    expect(percentile([10, 20, 30, 40], 0.95)).toBe(40);
  });

  it('answers null for no samples, because zero is a different claim', () => {
    expect(percentile([], 0.5)).toBeNull();
  });

  it('returns the only sample whatever the rank', () => {
    expect(percentile([120], 0.95)).toBe(120);
  });
});

describe('daily buckets', () => {
  it('returns one entry per day even where nothing was asked', () => {
    const days = bucketByDay([], { days: 7, now: NOW });

    expect(days).toHaveLength(7);
    expect(days.map((d) => d.day)).toEqual([
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
    ]);
    expect(days.every((d) => d.queries === 0)).toBe(true);
  });

  it('counts answers into their UTC day and reports both percentiles', () => {
    const days = bucketByDay(
      [
        sample({ occurredAt: '2026-09-08T23:59:59.000Z', latencyMs: 100 }),
        sample({ occurredAt: '2026-09-09T00:00:01.000Z', latencyMs: 200 }),
        sample({ occurredAt: '2026-09-09T10:00:00.000Z', latencyMs: 900 }),
      ],
      { days: 2, now: NOW },
    );

    expect(days[0]).toEqual({ day: '2026-09-08', queries: 1, p50Ms: 100, p95Ms: 100 });
    expect(days[1]).toEqual({ day: '2026-09-09', queries: 2, p50Ms: 200, p95Ms: 900 });
  });

  it('counts an answer with no recorded latency but leaves the percentiles unclaimed', () => {
    const days = bucketByDay([sample({ latencyMs: null })], { days: 1, now: NOW });

    expect(days[0]).toEqual({ day: '2026-09-09', queries: 1, p50Ms: null, p95Ms: null });
  });

  it('drops a sample older than the window', () => {
    const days = bucketByDay([sample({ occurredAt: '2026-01-01T00:00:00.000Z' })], {
      days: 3,
      now: NOW,
    });

    expect(days.every((d) => d.queries === 0)).toBe(true);
  });
});

describe('question normalization', () => {
  it('ignores case, padding, collapsed spaces and a trailing question mark', () => {
    expect(normalizeQuestion('  Where   is the   RUNBOOK? ')).toBe('where is the runbook');
  });
});

describe('top questions', () => {
  it('groups questions that differ only in case or spacing', () => {
    const top = groupQuestions(
      [
        questionRow({ content: 'Where is the deploy runbook?' }),
        questionRow({
          content: 'where is   the deploy runbook',
          createdAt: '2026-09-09T11:00:00.000Z',
        }),
        questionRow({ content: 'How do I rotate a key?' }),
      ],
      5,
    );

    expect(top).toEqual([
      {
        question: 'where is   the deploy runbook',
        askedCount: 2,
        lastAskedAt: '2026-09-09T11:00:00.000Z',
      },
      {
        question: 'How do I rotate a key?',
        askedCount: 1,
        lastAskedAt: '2026-09-09T09:00:00.000Z',
      },
    ]);
  });

  it('keeps the wording of the most recent asking', () => {
    const top = groupQuestions(
      [
        questionRow({ content: 'WHERE IS THE RUNBOOK', createdAt: '2026-09-01T09:00:00.000Z' }),
        questionRow({ content: 'Where is the runbook?', createdAt: '2026-09-08T09:00:00.000Z' }),
      ],
      5,
    );

    expect(top[0].question).toBe('Where is the runbook?');
  });

  it('breaks a tie on how recently it was asked', () => {
    const top = groupQuestions(
      [
        questionRow({ content: 'Older question', createdAt: '2026-09-01T09:00:00.000Z' }),
        questionRow({ content: 'Newer question', createdAt: '2026-09-08T09:00:00.000Z' }),
      ],
      5,
    );

    expect(top.map((t) => t.question)).toEqual(['Newer question', 'Older question']);
  });

  it('returns at most the requested number of questions', () => {
    const rows = ['a', 'b', 'c', 'd'].map((content) => questionRow({ content }));

    expect(groupQuestions(rows, 2)).toHaveLength(2);
  });

  it('ignores a message that is only whitespace', () => {
    expect(groupQuestions([questionRow({ content: '   ' })], 5)).toEqual([]);
  });
});
