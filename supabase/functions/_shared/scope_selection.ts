// connections.scope_selection holds both the options offered and the ones picked.

import { z } from 'zod';

import type { ScopeOption, ScopeSelection } from './sources/contract.ts';
import type { ScopeSelectionKind } from './providers.ts';

export const scopeOptionSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(300),
});

export const storedScopeSelectionSchema = z.object({
  kind: z.enum(['channel', 'folder', 'workspace']),
  available: z.array(scopeOptionSchema).max(1000),
  selected: z.array(z.string().min(1).max(200)).max(500),
});

export type StoredScopeSelection = z.infer<typeof storedScopeSelectionSchema>;

/** The ids a driver should read. Returns none when the column has not been populated. */
export function selectedIdsOf(raw: unknown): ScopeSelection {
  const parsed = storedScopeSelectionSchema.safeParse(raw);
  return { ids: parsed.success ? parsed.data.selected : [] };
}

/** What is already stored, or null when the picker has never been populated. */
export function storedSelectionOf(raw: unknown): StoredScopeSelection | null {
  const parsed = storedScopeSelectionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Merges a fresh listing with the existing choices, dropping ids the provider no longer offers. */
export function buildScopeSelection(
  kind: ScopeSelectionKind,
  available: ScopeOption[],
  selected: string[],
): StoredScopeSelection {
  const offered = new Set(available.map((option) => option.id));
  return {
    kind,
    available: available.map((option) => ({ id: option.id, name: option.name })),
    selected: selected.filter((id) => offered.has(id)),
  };
}
