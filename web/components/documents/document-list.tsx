import Link from 'next/link';

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
              <Link
                href={`/documents/${document.id}`}
                className="truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
              >
                {document.title}
              </Link>
              <time
                className="shrink-0 text-xs text-foreground-lighter"
                dateTime={document.updatedAt}
              >
                {document.updatedAt.slice(0, 10)}
              </time>
            </div>

            <p className="text-xs text-foreground-lighter">
              {describeOrigin(document.origin)} into {document.spaceName}
            </p>

            {problem ? (
              <p
                className={
                  isFailure ? 'text-xs text-destructive-600' : 'text-xs text-foreground-light'
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
