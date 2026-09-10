import { Suspense } from 'react';

import { Panel } from '@/components/admin/panel';
import { PanelSkeleton } from '@/components/admin/panel-skeleton';
import { parseRange, RangeFilter, type RangeDays } from '@/components/admin/range-filter';
import { TopQuestions } from '@/components/admin/top-questions';
import { ColumnChart } from '@/components/charts/column-chart';
import { LatencyChart } from '@/components/charts/latency-chart';
import { resolveAdminAccess } from '@/lib/analytics/access';
import { formatDayCaption, formatDayLabel } from '@/lib/analytics/format';
import {
  fetchAnswerLatency,
  fetchTopQuestions,
  type AnalyticsClient,
} from '@/lib/analytics/queries';

const TOP_QUESTION_COUNT = 8;

type RangedPanelProps = {
  readonly client: AnalyticsClient;
  readonly orgId: string;
  readonly now: Date;
  readonly days: RangeDays;
};

async function SearchActivityPanel({ client, orgId, now, days }: RangedPanelProps) {
  const series = await fetchAnswerLatency(client, orgId, { days, now });
  const points = series.map((day) => ({
    label: formatDayLabel(day.day),
    caption: formatDayCaption(day.day),
    value: day.queries,
    p50Ms: day.p50Ms,
    p95Ms: day.p95Ms,
  }));

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <ColumnChart
        title="Questions per day"
        description={`Answered turns over the last ${days} days.`}
        unitLabel="questions"
        points={points}
      />
      <LatencyChart
        title="Answer latency"
        description="p95 is the one to watch. p50 sits behind it for context."
        points={points}
      />
    </div>
  );
}

async function TopQuestionsPanel({ client, orgId, now, days }: RangedPanelProps) {
  const questions = await fetchTopQuestions(client, orgId, {
    days,
    limit: TOP_QUESTION_COUNT,
    now,
  });

  return <TopQuestions questions={questions} now={now} />;
}

export default async function AdminSearchesPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const access = await resolveAdminAccess();
  if (access.kind !== 'granted') return null;

  const days = parseRange((await searchParams).days);
  const now = new Date();
  const ranged = { client: access.elevated, orgId: access.context.orgId, now, days };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-tertiary-foreground">What is being asked, and how it answers.</p>
        <RangeFilter basePath="/admin/searches" active={days} />
      </div>

      <Panel
        title="Search activity"
        description="How much is being asked, and how long answers take."
      >
        <Suspense fallback={<PanelSkeleton rows={6} />}>
          <SearchActivityPanel {...ranged} />
        </Suspense>
      </Panel>

      <Panel title="Top questions" description="Questions grouped by wording.">
        <Suspense fallback={<PanelSkeleton rows={6} />}>
          <TopQuestionsPanel {...ranged} />
        </Suspense>
      </Panel>
    </div>
  );
}
