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
    return <EmptyState title="No questions yet" />;
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
