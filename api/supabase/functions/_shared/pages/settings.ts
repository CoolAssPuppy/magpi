/**
 * Reading what the wearer configured for one page.
 *
 * Its own module, not mod.ts: mod.ts imports every builder to assemble the
 * registry, so a builder importing back from it is a cycle, and the registry
 * ends up reading a slug that has not initialised yet.
 */

/** Which connection this page was told to read, if the wearer named one. */
export function chosenConnection(settings: Record<string, unknown>): string | null {
  const value = settings.connection_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}
