import { Suspense } from 'react';

import { DeadContent } from '@/components/admin/dead-content';
import { IngestHealth } from '@/components/admin/ingest-health';
import { Panel } from '@/components/admin/panel';
import { SectionHeader } from '@/components/admin/section-header';
import { PanelSkeleton } from '@/components/admin/panel-skeleton';
import { resolveAdminAccess } from '@/lib/analytics/access';
import { fetchDeadContent, fetchIngestHealth, type AnalyticsClient } from '@/lib/analytics/queries';

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

export default async function AdminOverviewPage() {
  const access = await resolveAdminAccess();
  if (access.kind !== 'granted') return null;

  const now = new Date();
  const orgId = access.context.orgId;

  const wide = { client: access.elevated, orgId, now };

  return (
    <div className="flex flex-col gap-10">
      <SectionHeader title="Content performance" />

      <Panel title="Ingest health">
        <Suspense fallback={<PanelSkeleton rows={4} />}>
          <IngestHealthPanel {...wide} />
        </Suspense>
      </Panel>

      <Panel title="Dead content">
        <Suspense fallback={<PanelSkeleton rows={5} />}>
          <DeadContentPanel {...wide} />
        </Suspense>
      </Panel>
    </div>
  );
}
