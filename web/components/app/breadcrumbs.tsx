'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';

import { useCrumbRecord } from './crumb-title';

/** Labels for the segments the routes actually use. */
const SECTION_LABELS: Readonly<Record<string, string>> = {
  chat: 'Chat',
  spaces: 'Spaces',
  documents: 'Documents',
  connections: 'Connections',
  dreams: 'Dreams',
  settings: 'Settings',
  admin: 'Admin',
  entities: 'Entities',
  members: 'Members',
  billing: 'Billing',
  searches: 'Searches',
};

/** What one record under a section is called, for the id segments no label can name. */
const RECORD_LABELS: Readonly<Record<string, string>> = {
  chat: 'Conversation',
  spaces: 'Space',
  documents: 'Document',
  dreams: 'Dream run',
};

const isRecordId = (segment: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment);

const titleCase = (segment: string): string =>
  segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

function labelFor(segment: string, parent: string | undefined): string {
  if (SECTION_LABELS[segment]) return SECTION_LABELS[segment];
  if (isRecordId(segment)) return (parent && RECORD_LABELS[parent]) ?? 'Detail';
  return titleCase(segment);
}

export type Crumb = { readonly href: string; readonly label: string };

export function crumbsFor(pathname: string, recordTitle: string | null = null): readonly Crumb[] {
  const segments = pathname.split('/').filter(Boolean);

  return segments.map((segment, index) => {
    const isLast = index === segments.length - 1;
    // The page knows the record's name; the path only ever knew its id.
    const named = isLast && recordTitle && isRecordId(segment) ? recordTitle : null;

    return {
      href: `/${segments.slice(0, index + 1).join('/')}`,
      label: named ?? labelFor(segment, segments[index - 1]),
    };
  });
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const record = useCrumbRecord();
  const crumbs = crumbsFor(pathname, record?.title ?? null);

  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex h-9 items-center">
      <ol className="flex min-w-0 items-center gap-1.5 text-xs">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;

          return (
            <Fragment key={crumb.href}>
              {index > 0 ? (
                <li aria-hidden className="text-border-stronger select-none">
                  /
                </li>
              ) : null}
              <li className="flex min-w-0 items-center gap-1.5">
                {/* The mark sits beside the name rather than around it, so the name stays the
                    element carrying aria-current. */}
                {isLast ? record?.icon : null}
                {isLast ? (
                  <span aria-current="page" className="block truncate text-foreground">
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="block truncate text-tertiary-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
                  >
                    {crumb.label}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
