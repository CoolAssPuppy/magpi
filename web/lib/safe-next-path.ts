/**
 * Reduces an untrusted `next` parameter to a same-origin path. A value that is
 * not a plain absolute path becomes '/', so a redirect can never leave the app.
 */
export function safeNextPath(value: string | null | undefined, fallback = '/'): string {
  if (!value) return fallback;
  if (!value.startsWith('/')) return fallback;
  // Protocol-relative (`//evil.com`) and backslash variants resolve off-origin
  // in some browsers.
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}
