/**
 * What the upload surface accepts.
 *
 * The list has to match the extractor's table in
 * `supabase/functions/_shared/extract.ts`, which answers 415 for anything it
 * does not recognise. A type accepted here and missing there is a file the user
 * watches upload and then finds failed, three jobs later, with a message about
 * a mime type. `scripts/check-upload-types.mjs` fails the build when the two
 * disagree.
 */
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

/**
 * The first path segment is the permission decision, so the server builds it
 * from the space it has already checked rather than reading it off the request.
 */
export function storagePathFor(spaceId: string, objectName: string): string {
  return `${spaceId}/${objectName}`;
}

/**
 * Browsers report an empty type for several of the accepted extensions, `.md`
 * and `.csv` among them, so the name is the more reliable of the two.
 */
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
