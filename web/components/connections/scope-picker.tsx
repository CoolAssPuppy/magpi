'use client';

import { describeScopeSelection, type ScopeSelection } from '@/lib/connections/scope-selection';

/**
 * Which channels or folders a connection reads. The list comes from the source
 * itself, so before the token exchange there is nothing true to show and the
 * picker says so instead of rendering an empty list.
 */
export function ScopePicker({
  selection,
  selected,
  onChange,
  disabled = false,
}: {
  selection: ScopeSelection;
  selected: readonly string[];
  onChange: (selected: readonly string[]) => void;
  disabled?: boolean;
}) {
  if (selection.kind === 'unset') {
    return (
      <p className="max-w-[var(--measure-prose)] text-sm text-foreground-lighter">
        This source has not listed what it can read yet. Authorize it and the list appears here.
      </p>
    );
  }

  if (selection.selectionKind === 'workspace') {
    return (
      <p className="max-w-[var(--measure-prose)] text-sm text-foreground-lighter">
        This connection reads the whole workspace: {selection.available.map((i) => i.name).join(', ')}.
      </p>
    );
  }

  const toggle = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((current) => current !== id)
      : [...selected, id];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-foreground-lighter">
        {describeScopeSelection({ ...selection, selected: [...selected] })}
      </p>
      <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-[var(--radius-panel)] border border-border">
        {selection.available.map((item) => (
          <li key={item.id}>
            <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-background-surface-200">
              <input
                type="checkbox"
                className="size-4 rounded-sm border-border-strong text-brand-600 focus-visible:ring-2 focus-visible:ring-border-strong"
                checked={selected.includes(item.id)}
                disabled={disabled}
                onChange={() => toggle(item.id)}
              />
              <span className="truncate">{item.name}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
