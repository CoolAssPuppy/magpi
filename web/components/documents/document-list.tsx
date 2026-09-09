import Link from 'next/link';

import { describeIngest, describeOrigin, type DocumentSummary } from '@/lib/documents/documents';

export function DocumentList({ documents }: { documents: readonly DocumentSummary[] }) {
  return (
    <ul className="border-border divide-border divide-y rounded-[var(--radius-panel)] border">
      {documents.map((document) => {
        const problem = describeIngest(document.ingest);
        const isFailure =
          document.ingest?.status === 'failed' || document.ingest?.status === 'timeout';

        return (
          <li key={document.id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex items-baseline justify-between gap-4">
              <Link
                href={`/documents/${document.id}`}
                className="text-foreground truncate text-sm font-medium underline-offset-4 hover:underline"
              >
                {document.title}
              </Link>
              <time
                className="text-foreground-lighter shrink-0 text-xs"
                dateTime={document.updatedAt}
              >
                {document.updatedAt.slice(0, 10)}
              </time>
            </div>

            <p className="text-foreground-lighter text-xs">
              {describeOrigin(document.origin)} into {document.spaceName}
            </p>

            {problem ? (
              <p className={isFailure ? 'text-destructive-600 text-xs' : 'text-foreground-light text-xs'}>
                {problem}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
