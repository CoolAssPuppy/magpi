import { Suspense } from 'react';

import { DeadContent } from '@/components/admin/dead-content';
import { IngestHealth } from '@/components/admin/ingest-health';
import { Panel } from '@/components/admin/panel';
import { PanelSkeleton } from '@/components/admin/panel-skeleton';
import { PlanUsage } from '@/components/admin/plan-usage';
import { resolveAdminAccess } from '@/lib/analytics/access';
import {
  fetchDeadContent,
  fetchIngestHealth,
  fetchPlanUsage,
  type AnalyticsClient,
} from '@/lib/analytics/queries';

const DEAD_CONTENT_SAMPLE = 8;

type PanelProps = {
  readonly client: AnalyticsClient;
  readonly orgId: string;
  readonly now: Date;
};

async function IngestHealthPanel({ client, orgId, now }: PanelProps) {
  return <IngestHealth rows={await fetchIngestHealth(client, orgId)} now={now} />;
}

async function DeadContentPanel({ client, orgId, now }: PanelProps) {
  const content = await fetchDeadContent(client, orgId, { sampleSize: DEAD_CONTENT_SAMPLE });

  return <DeadContent content={content} now={now} />;
}

async function PlanUsagePanel({ client, orgId, now }: PanelProps) {
  return <PlanUsage usage={await fetchPlanUsage(client, orgId, { now })} />;
}

export default async function AdminOverviewPage() {
  const access = await resolveAdminAccess();
  if (access.kind !== 'granted') return null;

  const now = new Date();
  const orgId = access.context.orgId;

  // Org-wide panels read through the elevated client; plan usage stays on the caller's own.
  const wide = { client: access.elevated, orgId, now };
  const own = { client: access.context.supabase, orgId, now };

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-tertiary-foreground">
        Everything below is scoped to this organization.
      </p>

      <Panel
        title="Ingest health"
        description="One row per connection, with the stage any failed job stopped at."
      >
        <Suspense fallback={<PanelSkeleton rows={4} />}>
          <IngestHealthPanel {...wide} />
        </Suspense>
      </Panel>

      <Panel title="Dead content" description="Documents no answer has ever cited.">
        <Suspense fallback={<PanelSkeleton rows={5} />}>
          <DeadContentPanel {...wide} />
        </Suspense>
      </Panel>

      <Panel title="Usage against plan" description="Usage against your plan this month.">
        <Suspense fallback={<PanelSkeleton rows={3} />}>
          <PlanUsagePanel {...own} />
        </Suspense>
      </Panel>
    </div>
  );
}
