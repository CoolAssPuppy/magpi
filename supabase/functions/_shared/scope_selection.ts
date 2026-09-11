// connections.scope_selection holds both the options offered and the ones picked.

import { z } from 'zod';

import type { ScopeOption, ScopeSelection } from './sources/contract.ts';
import type { ScopeSelectionKind } from './providers.ts';

export const scopeOptionSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(300),
});

export const storedScopeSelectionSchema = z.object({
  kind: z.enum(['channel', 'folder', 'workspace', 'repository']),
  available: z.array(scopeOptionSchema).max(1000),
  /** Unit id to space id. A unit with no entry is read by nobody. */
  routes: z.record(z.string().min(1).max(200), z.uuid()),
});

export type StoredScopeSelection = z.infer<typeof storedScopeSelectionSchema>;

/** The ids a driver should read, which is every unit that has somewhere to land. */
export function selectedIdsOf(raw: unknown): ScopeSelection {
  const parsed = storedScopeSelectionSchema.safeParse(raw);
  return { ids: parsed.success ? Object.keys(parsed.data.routes) : [] };
}

/** What is already stored, or null when the picker has never been populated. */
export function storedSelectionOf(raw: unknown): StoredScopeSelection | null {
  const parsed = storedScopeSelectionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Merges a fresh listing with the existing routing, dropping units the provider no longer offers. */
export function buildScopeSelection(
  kind: ScopeSelectionKind,
  available: ScopeOption[],
  routes: Record<string, string>,
): StoredScopeSelection {
  const offered = new Set(available.map((option) => option.id));
  return {
    kind,
    available: available.map((option) => ({ id: option.id, name: option.name })),
    routes: Object.fromEntries(Object.entries(routes).filter(([unit]) => offered.has(unit))),
  };
}
