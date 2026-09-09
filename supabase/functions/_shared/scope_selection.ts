// What a connection reads, and what it could read.
//
// connections.scope_selection is jsonb defaulting to {}, and the connect screen
// needs both halves: the list of channels or folders to offer, and the ones the
// user picked. The column holds both, because the alternative is a provider
// round trip on every render of a page that is mostly not being changed.
//
// The web app cannot write this column. connections has a select policy and a
// delete policy and nothing else, so every change comes through
// connections-scopes under the service role.

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

/**
 * The ids a driver should read, out of whatever is in the column.
 *
 * Tolerant on purpose: the column defaults to {} and stays that way until the
 * picker has been opened once, and a connection in that state still syncs. What
 * an empty selection means is the driver's business, and the four disagree:
 * Slack reads nothing without channels, Drive reads everything without a folder
 * filter.
 */
export function selectedIdsOf(raw: unknown): ScopeSelection {
  const parsed = storedScopeSelectionSchema.safeParse(raw);
  return { ids: parsed.success ? parsed.data.selected : [] };
}

/** What is already stored, or null when the picker has never been populated. */
export function storedSelectionOf(raw: unknown): StoredScopeSelection | null {
  const parsed = storedScopeSelectionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Merges a fresh listing with what the user had already chosen.
 *
 * A selected id that has disappeared from the provider is dropped rather than
 * kept: a channel that was archived is not something the connection can read,
 * and leaving it would make the picker show a choice that does nothing.
 */
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
