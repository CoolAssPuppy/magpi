import { Suspense } from 'react';

import { DeadContent } from '@/components/admin/dead-content';
import { IngestHealth } from '@/components/admin/ingest-health';
import { Panel } from '@/components/admin/panel';
import { PanelSkeleton } from '@/components/admin/panel-skeleton';
import { PlanUsage } from '@/components/admin/plan-usage';
import { parseRange, RangeFilter, type RangeDays } from '@/components/admin/range-filter';
import { TopQuestions } from '@/components/admin/top-questions';
import { ColumnChart } from '@/components/charts/column-chart';
import { LatencyChart } from '@/components/charts/latency-chart';
import { resolveAdminAccess } from '@/lib/analytics/access';
import { formatDayCaption, formatDayLabel } from '@/lib/analytics/format';
import {
  fetchAnswerLatency,
  fetchDeadContent,
  fetchIngestHealth,
  fetchPlanUsage,
  fetchTopQuestions,
  type AnalyticsClient,
} from '@/lib/analytics/queries';

const DEAD_CONTENT_SAMPLE = 8;
const TOP_QUESTION_COUNT = 8;

type PanelProps = {
  readonly client: AnalyticsClient;
  readonly orgId: string;
  readonly now: Date;
};

type RangedPanelProps = PanelProps & { readonly days: RangeDays };

async function IngestHealthPanel({ client, orgId, now }: PanelProps) {
  return <IngestHealth rows={await fetchIngestHealth(client, orgId)} now={now} />;
}

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

async function DeadContentPanel({ client, orgId, now }: PanelProps) {
  const content = await fetchDeadContent(client, orgId, { sampleSize: DEAD_CONTENT_SAMPLE });

  return <DeadContent content={content} now={now} />;
}

async function PlanUsagePanel({ client, orgId, now }: PanelProps) {
  return <PlanUsage usage={await fetchPlanUsage(client, orgId, { now })} />;
}

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const access = await resolveAdminAccess();
  if (access.kind !== 'granted') return null;

  const days = parseRange((await searchParams).days);
  const now = new Date();
  const orgId = access.context.orgId;

  // Org-wide panels read through the elevated client: connections, documents and
  // messages are governed by per-space and per-user policies, so an admin has no
  // policy that would let them see the whole organization. Plan usage stays on
  // the caller's own client, where usage_events already has an admin policy.
  const wide = { client: access.elevated, orgId, now };
  const own = { client: access.context.supabase, orgId, now };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-tertiary-foreground">
          Everything below is scoped to this organization.
        </p>
        <RangeFilter basePath="/admin" active={days} />
      </div>

      <Panel
        title="Ingest health"
        description="One row per connection. A job that ran out of wall clock names the stage it died in."
      >
        <Suspense fallback={<PanelSkeleton rows={4} />}>
          <IngestHealthPanel {...wide} />
        </Suspense>
      </Panel>

      <Panel
        title="Search activity"
        description="How much is being asked, and how long answers take."
      >
        <Suspense fallback={<PanelSkeleton rows={6} />}>
          <SearchActivityPanel {...wide} days={days} />
        </Suspense>
      </Panel>

      <Panel title="Top questions" description="What people actually ask, grouped by wording.">
        <Suspense fallback={<PanelSkeleton rows={6} />}>
          <TopQuestionsPanel {...wide} days={days} />
        </Suspense>
      </Panel>

      <Panel
        title="Dead content"
        description="Documents no answer has ever cited. In most knowledge bases this is about half of it."
      >
        <Suspense fallback={<PanelSkeleton rows={5} />}>
          <DeadContentPanel {...wide} />
        </Suspense>
      </Panel>

      <Panel title="Usage against plan" description="Read from metered usage, never from a scan.">
        <Suspense fallback={<PanelSkeleton rows={3} />}>
          <PlanUsagePanel {...own} />
        </Suspense>
      </Panel>
    </div>
  );
}
