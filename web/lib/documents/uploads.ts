/** What the upload surface accepts. Must match the extractor table in _shared/extract.ts. */
export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'application/json',
] as const;

export type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** The first path segment is the permission decision, built from a space already checked. */
export function storagePathFor(spaceId: string, objectName: string): string {
  return `${spaceId}/${objectName}`;
}

/** Browsers report an empty type for `.md` and `.csv`, so the file name is more reliable. */
const TYPE_BY_EXTENSION: Record<string, AcceptedMimeType> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  html: 'text/html',
  htm: 'text/html',
  json: 'application/json',
};

function isAccepted(value: string): value is AcceptedMimeType {
  return (ACCEPTED_MIME_TYPES as readonly string[]).includes(value);
}

/** The type to record for a file, or null when nothing downstream could read it. */
export function acceptedTypeFor(browserType: string, fileName: string): AcceptedMimeType | null {
  const base = browserType.split(';', 1)[0].trim().toLowerCase();
  if (isAccepted(base)) return base;

  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return TYPE_BY_EXTENSION[extension] ?? null;
}
