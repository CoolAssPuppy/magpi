import { EmptyState } from '@/components/app/empty-state';
import { Meter } from '@/components/charts/meter';
import { formatSince } from '@/lib/analytics/format';
import type { DeadContent as DeadContentData } from '@/lib/analytics/queries';

export function DeadContent({ content, now }: { content: DeadContentData; now: Date }) {
  if (content.totalDocuments === 0) {
    return <EmptyState title="No documents yet" />;
  }

  const share = Math.round((content.neverRetrieved / content.totalDocuments) * 100);

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-md">
        <p className="font-heading text-3xl leading-none font-medium text-foreground">{share}%</p>
        <p className="mt-2 max-w-[var(--measure-prose)] text-sm text-tertiary-foreground">
          {content.neverRetrieved.toLocaleString('en-US')} of{' '}
          {content.totalDocuments.toLocaleString('en-US')} documents have never been cited in an
          answer.
        </p>
        <div className="mt-4">
          <Meter
            label="Never retrieved"
            used={content.neverRetrieved}
            limit={content.totalDocuments}
            unit="documents"
          />
        </div>
      </div>

      {content.samples.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium text-foreground">The oldest of it</h3>
          <ul className="mt-3 flex flex-col divide-y divide-border border-y border-border">
            {content.samples.map((document) => (
              <li key={document.id} className="flex items-baseline justify-between gap-4 py-2.5">
                <p className="truncate text-sm text-foreground" title={document.title}>
                  {document.title}
                </p>
                <p className="shrink-0 text-xs text-tertiary-foreground">
                  Added {formatSince(document.createdAt, now).toLowerCase()}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
