import { Suspense } from 'react';

import { Panel } from '@/components/admin/panel';
import { PanelSkeleton } from '@/components/admin/panel-skeleton';
import { PlanUsage } from '@/components/admin/plan-usage';
import { SectionHeader } from '@/components/admin/section-header';
import { resolveAdminAccess } from '@/lib/analytics/access';
import { fetchPlanUsage, type AnalyticsClient } from '@/lib/analytics/queries';

async function PlanUsagePanel({
  client,
  orgId,
  now,
}: {
  readonly client: AnalyticsClient;
  readonly orgId: string;
  readonly now: Date;
}) {
  return <PlanUsage usage={await fetchPlanUsage(client, orgId, { now })} />;
}

export default async function AdminConsumptionPage() {
  const access = await resolveAdminAccess();
  if (access.kind !== 'granted') return null;

  // Plan usage reads through the caller's own client, not the elevated one.
  const own = {
    client: access.context.supabase,
    orgId: access.context.orgId,
    now: new Date(),
  };

  return (
    <div className="flex flex-col gap-10">
      <SectionHeader title="How much you're using" />

      <Panel title="Usage against plan">
        <Suspense fallback={<PanelSkeleton rows={3} />}>
          <PlanUsagePanel {...own} />
        </Suspense>
      </Panel>
    </div>
  );
}
