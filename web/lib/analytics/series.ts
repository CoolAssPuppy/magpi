export type LatencySample = {
  readonly occurredAt: string;
  readonly latencyMs: number | null;
};

export type DailyBucket = {
  readonly day: string;
  readonly queries: number;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
};

export type QuestionRow = {
  readonly content: string;
  readonly createdAt: string;
};

export type QuestionCount = {
  readonly question: string;
  readonly askedCount: number;
  readonly lastAskedAt: string;
};

/** Nearest-rank percentile over a sorted list. An empty list gives null, never zero. */
export function percentile(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil(fraction * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
}

function utcDayKey(iso: string): string {
  return iso.slice(0, 10);
}

function shiftUtcDays(from: Date, days: number): string {
  const shifted = new Date(from.getTime() + days * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

/** A dense series, one entry per day, oldest first. A day with no traffic is a zero. */
export function bucketByDay(
  samples: readonly LatencySample[],
  { days, now }: { days: number; now: Date },
): readonly DailyBucket[] {
  const latenciesByDay = new Map<string, number[]>();
  const countsByDay = new Map<string, number>();

  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    keys.push(shiftUtcDays(now, -offset));
  }
  const window = new Set(keys);

  for (const sample of samples) {
    const key = utcDayKey(sample.occurredAt);
    if (!window.has(key)) continue;

    countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
    if (sample.latencyMs === null) continue;

    const latencies = latenciesByDay.get(key);
    if (latencies) latencies.push(sample.latencyMs);
    else latenciesByDay.set(key, [sample.latencyMs]);
  }

  return keys.map((day) => {
    const latencies = (latenciesByDay.get(day) ?? []).slice().sort((a, b) => a - b);
    return {
      day,
      queries: countsByDay.get(day) ?? 0,
      p50Ms: percentile(latencies, 0.5),
      p95Ms: percentile(latencies, 0.95),
    };
  });
}

export function normalizeQuestion(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[?.!]+$/, '');
}

/** Groups questions by normalized form into one row each, labelled with the latest wording. */
export function groupQuestions(
  rows: readonly QuestionRow[],
  limit: number,
): readonly QuestionCount[] {
  const grouped = new Map<string, { question: string; askedCount: number; lastAskedAt: string }>();

  for (const row of rows) {
    const key = normalizeQuestion(row.content);
    if (key === '') continue;

    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { question: row.content, askedCount: 1, lastAskedAt: row.createdAt });
      continue;
    }

    existing.askedCount += 1;
    if (row.createdAt > existing.lastAskedAt) {
      existing.lastAskedAt = row.createdAt;
      existing.question = row.content;
    }
  }

  return [...grouped.values()]
    .sort((a, b) => b.askedCount - a.askedCount || b.lastAskedAt.localeCompare(a.lastAskedAt))
    .slice(0, limit);
}
