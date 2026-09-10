import Link from 'next/link';

import { describeKind, type Space } from '@/lib/spaces/spaces';

/** A list of spaces, each with its kind, document count and member count. */
export function SpaceList({ spaces }: { spaces: readonly Space[] }) {
  return (
    <ul className="divide-y divide-border rounded-[var(--radius-panel)] border border-border">
      {spaces.map((space) => (
        <li key={space.id} className="flex items-baseline justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <Link
              href={`/spaces/${space.id}`}
              className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              {space.name}
            </Link>
            <p className="mt-0.5 text-xs text-tertiary-foreground">{describeKind(space.kind)}</p>
          </div>

          <dl className="flex shrink-0 gap-5 text-xs text-tertiary-foreground">
            <div className="text-right">
              <dt className="sr-only">Documents</dt>
              <dd className="text-muted-foreground tabular-nums">{space.documentCount}</dd>
              <dd>documents</dd>
            </div>
            <div className="text-right">
              <dt className="sr-only">Members</dt>
              <dd className="text-muted-foreground tabular-nums">{space.memberCount}</dd>
              <dd>{space.memberCount === 1 ? 'member' : 'members'}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
