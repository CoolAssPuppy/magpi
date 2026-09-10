import Link from 'next/link';

import { SourceMark } from '@/components/brand/source-mark';
import { describeIngest, describeOrigin, type DocumentSummary } from '@/lib/documents/documents';

export function DocumentList({ documents }: { documents: readonly DocumentSummary[] }) {
  return (
    <ul className="divide-y divide-border rounded-[var(--radius-panel)] border border-border">
      {documents.map((document) => {
        const problem = describeIngest(document.ingest);
        const isFailure =
          document.ingest?.status === 'failed' || document.ingest?.status === 'timeout';

        return (
          <li key={document.id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex items-baseline justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2">
                <SourceMark source={document.provider ?? document.url ?? document.origin} title />
                <Link
                  href={`/documents/${document.id}`}
                  className="truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {document.title}
                </Link>
              </div>
              <time
                className="shrink-0 text-xs text-tertiary-foreground"
                dateTime={document.updatedAt}
              >
                {document.updatedAt.slice(0, 10)}
              </time>
            </div>

            <p className="text-xs text-tertiary-foreground">
              {describeOrigin(document.origin)} into {document.spaceName}
            </p>

            {problem ? (
              <p
                className={
                  isFailure ? 'text-xs text-destructive-600' : 'text-xs text-muted-foreground'
                }
              >
                {problem}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
