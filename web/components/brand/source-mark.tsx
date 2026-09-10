import { cn } from '@/lib/utils';

import { SOURCE_PATHS, type SourceSlug } from './source-icons';

/** What each source is called, and the token holding its identity colour. */
const MARKS: Record<SourceSlug, { readonly label: string; readonly color: string }> = {
  notion: { label: 'Notion', color: 'var(--icon-notion)' },
  linear: { label: 'Linear', color: 'var(--icon-linear)' },
  slack: { label: 'Slack', color: 'var(--icon-slack)' },
  google_drive: { label: 'Google Drive', color: 'var(--icon-google-drive)' },
  upload: { label: 'Uploaded', color: 'var(--icon-upload)' },
};

/** `drive` in the corpus manifest is the same source the providers table calls `google_drive`. */
const ALIASES: Record<string, SourceSlug> = {
  drive: 'google_drive',
  'google-drive': 'google_drive',
  googledrive: 'google_drive',
  sync: 'upload',
  dream: 'upload',
};

/** A synced document has no connection row in a seeded database, but its url names the tool. */
const HOSTS: readonly (readonly [RegExp, SourceSlug])[] = [
  [/(^|\.)notion\.so$/, 'notion'],
  [/(^|\.)linear\.app$/, 'linear'],
  [/(^|\.)slack\.com$/, 'slack'],
  [/(^|\.)google\.com$/, 'google_drive'],
];

export function toSourceSlug(value: string | null | undefined): SourceSlug | null {
  if (!value) return null;

  if (value.startsWith('http')) {
    try {
      const { hostname } = new URL(value);
      return HOSTS.find(([pattern]) => pattern.test(hostname))?.[1] ?? null;
    } catch {
      return null;
    }
  }

  const key = value.toLowerCase();
  if (key in MARKS) return key as SourceSlug;
  return ALIASES[key] ?? null;
}

export function SourceMark({
  source,
  className,
  title,
}: {
  source: string | null | undefined;
  className?: string;
  title?: boolean;
}) {
  const slug = toSourceSlug(source);
  if (!slug) return null;

  const mark = MARKS[slug];

  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('size-4 shrink-0', className)}
      style={{ fill: mark.color }}
      role={title ? 'img' : undefined}
      aria-label={title ? mark.label : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{mark.label}</title> : null}
      <path d={SOURCE_PATHS[slug]} />
    </svg>
  );
}
