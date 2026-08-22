// The `next` parameter is attacker-controlled, so only same-site paths pass.

export const DEFAULT_NEXT_PATH = "/dashboard";
export const LINK_BADGE_PATH = "/link";

// Some URL parsers normalize a backslash into a forward slash, so
// "/\evil.example" becomes "//evil.example" after the prefix checks have run.
const UNSAFE_CHARACTERS = /[\u0000-\u0020\u007f\\]/;

/**
 * Where a sign-in should land.
 *
 * An account with no badge has nothing to configure: pages and connections
 * describe what a badge shows, so landing on them first asks someone to
 * decorate a thing they do not have. A `next` the visitor arrived with always
 * wins, because someone who scanned a QR is already holding a code.
 */
export function landingPath(next: string, hasBadges: boolean): string {
  if (next !== DEFAULT_NEXT_PATH) return next;
  return hasBadges ? DEFAULT_NEXT_PATH : LINK_BADGE_PATH;
}

export function safeNextPath(value: unknown, fallback: string = DEFAULT_NEXT_PATH): string {
  if (typeof value !== "string" || value.length === 0) return fallback;

  // One leading slash is not enough: "//evil.example" is protocol-relative.
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (UNSAFE_CHARACTERS.test(value)) return fallback;

  return value;
}
