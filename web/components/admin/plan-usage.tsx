import Link from 'next/link';

import { Meter } from '@/components/charts/meter';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/lib/analytics/format';
import type { PlanUsage as PlanUsageData } from '@/lib/analytics/queries';
import { planById } from '@/lib/billing/plans';

export function PlanUsage({ usage }: { usage: PlanUsageData }) {
  const plan = planById(usage.plan);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="text-sm text-foreground-light">
          On the <span className="text-foreground">{plan.name}</span> plan. {plan.summary}
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/billing">Manage billing</Link>
        </Button>
      </div>

      <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        <Meter
          label="Documents ingested"
          used={usage.documents.used}
          limit={usage.documents.limit}
          unit="documents"
        />
        <Meter
          label="Questions this month"
          used={usage.queries.used}
          limit={usage.queries.limit}
          unit="questions"
        />
        <Meter label="Seats used" used={usage.seats.used} limit={usage.seats.limit} unit="seats" />
        <Meter
          label="Storage stored"
          used={usage.storageBytes.used}
          limit={usage.storageBytes.limit}
          unit="bytes"
          formatValue={formatBytes}
        />
      </div>

      <p className="max-w-[var(--measure-prose)] text-xs text-foreground-lighter">
        Every number here is read from the metered usage events, which is the same count the
        database checks before it accepts an ingest job. Storage has no plan limit, so it is a
        running total rather than a gauge.
      </p>
    </div>
  );
}
