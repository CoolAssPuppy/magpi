import { EmptyState } from '@/components/app/empty-state';
import { RankedBars } from '@/components/charts/ranked-bars';
import { formatSince } from '@/lib/analytics/format';
import type { QuestionCount } from '@/lib/analytics/series';

export function TopQuestions({
  questions,
  now,
}: {
  questions: readonly QuestionCount[];
  now: Date;
}) {
  if (questions.length === 0) {
    return (
      <EmptyState
        title="Nobody has asked anything yet"
        description="Every question anyone asks in chat lands here, grouped by what was actually asked. It is the fastest way to see what your team keeps looking for."
      />
    );
  }

  return (
    <RankedBars
      valueLabel="times asked"
      items={questions.map((question) => ({
        id: question.question,
        label: question.question,
        value: question.askedCount,
        caption: `Last asked ${formatSince(question.lastAskedAt, now).toLowerCase()}`,
      }))}
    />
  );
}
