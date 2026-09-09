import { z } from 'zod';

import { err, ok, type Result } from '@/lib/result';

/**
 * Which channels, folders or workspaces a connection reads.
 *
 * The provider writes `available` after the token exchange, because only a
 * request carrying the token can list them. The user then edits `selected`, and
 * a selection is only ever accepted from what the provider offered.
 */
const scopeItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.url().nullish().transform((value) => value ?? null),
});

const populatedSchema = z.object({
  kind: z.enum(['channel', 'folder', 'workspace']),
  available: z.array(scopeItemSchema),
  selected: z.array(z.string()),
});

export type ScopeSelectionKind = z.infer<typeof populatedSchema>['kind'];
export type ScopeItem = z.infer<typeof scopeItemSchema>;

export type ScopeSelection =
  | { readonly kind: 'unset' }
  | {
      readonly kind: 'set';
      readonly selectionKind: ScopeSelectionKind;
      readonly available: readonly ScopeItem[];
      readonly selected: readonly string[];
    };

const UNSET: ScopeSelection = { kind: 'unset' };

export function parseScopeSelection(value: unknown): Result<ScopeSelection, string> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return err('The stored scope selection is not an object.');
  }
  if (Object.keys(value).length === 0) return ok(UNSET);

  const parsed = populatedSchema.safeParse(value);
  if (!parsed.success) return err('The stored scope selection does not match the schema.');

  return ok({
    kind: 'set',
    selectionKind: parsed.data.kind,
    available: parsed.data.available,
    selected: parsed.data.selected,
  });
}

/**
 * Validates a requested selection against what the provider actually offered, so
 * a forged form cannot widen a connection beyond the channels it was granted.
 */
export function applySelection(
  selection: ScopeSelection,
  requested: readonly string[],
): Result<readonly string[], string> {
  if (selection.kind === 'unset') {
    return err('This connection has not listed what it can read yet.');
  }

  const offered = new Set(selection.available.map((item) => item.id));
  const unknown = requested.filter((id) => !offered.has(id));
  if (unknown.length > 0) {
    return err(`This connection was never offered: ${unknown.join(', ')}`);
  }

  return ok(requested);
}

const NOUNS: Record<ScopeSelectionKind, string> = {
  channel: 'channels',
  folder: 'folders',
  workspace: 'workspaces',
};

export function describeScopeSelection(selection: ScopeSelection): string {
  if (selection.kind === 'unset') return 'Nothing chosen yet';
  if (selection.selectionKind === 'workspace') return 'The whole workspace';

  const noun = NOUNS[selection.selectionKind];
  if (selection.selected.length === 0) return `No ${noun} selected`;
  return `${selection.selected.length} of ${selection.available.length} ${noun}`;
}

export function serializeScopeSelection(
  selection: Extract<ScopeSelection, { kind: 'set' }>,
  selected: readonly string[],
) {
  return {
    kind: selection.selectionKind,
    available: selection.available.map((item) => ({
      id: item.id,
      name: item.name,
      url: item.url,
    })),
    selected: [...selected],
  };
}
