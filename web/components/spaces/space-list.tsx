import Link from 'next/link';

import { describeKind, type Space } from '@/lib/spaces/spaces';

/**
 * A list, not a card grid. Every space carries the same four facts, so a grid of
 * identical cards would add a border per row and no information.
 */
export function SpaceList({ spaces }: { spaces: readonly Space[] }) {
  return (
    <ul className="border-border divide-border divide-y rounded-[var(--radius-panel)] border">
      {spaces.map((space) => (
        <li key={space.id} className="flex items-baseline justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <Link
              href={`/spaces/${space.id}`}
              className="text-foreground text-sm font-medium underline-offset-4 hover:underline"
            >
              {space.name}
            </Link>
            <p className="text-foreground-lighter mt-0.5 text-xs">{describeKind(space.kind)}</p>
          </div>

          <dl className="text-foreground-lighter flex shrink-0 gap-5 text-xs">
            <div className="text-right">
              <dt className="sr-only">Documents</dt>
              <dd className="text-foreground-light tabular-nums">{space.documentCount}</dd>
              <dd>documents</dd>
            </div>
            <div className="text-right">
              <dt className="sr-only">Members</dt>
              <dd className="text-foreground-light tabular-nums">{space.memberCount}</dd>
              <dd>{space.memberCount === 1 ? 'member' : 'members'}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
