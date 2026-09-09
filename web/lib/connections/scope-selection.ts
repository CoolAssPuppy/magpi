import { z } from 'zod';

import { err, ok, type Result } from '@/lib/result';

/**
 * Which channels, folders or workspaces a connection reads.
 *
 * The list comes from the provider, so it can only be filled in by a request
 * carrying the token. connections-scopes writes it and is the only thing that
 * writes it; this module reads it.
 */
const scopeItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
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

/**
 * An empty selection means opposite things depending on the source, and the
 * difference is a support ticket if the picker stays quiet about it. A channel
 * source reads nothing until channels are picked; a folder source reads
 * everything until folders narrow it.
 *
 * Keyed on the kind rather than the provider slug, so adding a provider stays a
 * migration and a driver rather than a change here.
 */
export function describeEmptySelection(kind: ScopeSelectionKind): string | null {
  switch (kind) {
    case 'channel':
      return 'With no channels selected, Magpi reads nothing from this source.';
    case 'folder':
      return 'With no folders selected, Magpi reads everything this account can see.';
    case 'workspace':
      return null;
    default: {
      const unhandled: never = kind;
      throw new Error(`Unhandled scope selection kind: ${String(unhandled)}`);
    }
  }
}
