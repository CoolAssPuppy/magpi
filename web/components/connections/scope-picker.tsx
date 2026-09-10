'use client';

import {
  describeEmptySelection,
  describeScopeSelection,
  type ScopeSelection,
} from '@/lib/connections/scope-selection';

/** Which channels or folders a connection reads. Says so when the source has not listed any. */
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
      <p className="max-w-[var(--measure-prose)] text-sm text-tertiary-foreground">
        This source has not listed what it can read yet. Authorize it and the list appears here.
      </p>
    );
  }

  if (selection.selectionKind === 'workspace') {
    return (
      <p className="max-w-[var(--measure-prose)] text-sm text-tertiary-foreground">
        This connection reads the whole workspace:{' '}
        {selection.available.map((i) => i.name).join(', ')}.
      </p>
    );
  }

  const toggle = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((current) => current !== id)
      : [...selected, id];
    onChange(next);
  };

  const emptyMeaning =
    selected.length === 0 ? describeEmptySelection(selection.selectionKind) : null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-tertiary-foreground">
        {describeScopeSelection({ ...selection, selected: [...selected] })}
      </p>
      {emptyMeaning ? (
        <p className="max-w-[var(--measure-prose)] text-xs text-muted-foreground">{emptyMeaning}</p>
      ) : null}
      <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-[var(--radius-panel)] border border-border">
        {selection.available.map((item) => (
          <li key={item.id}>
            <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted">
              <input
                type="checkbox"
                className="size-4 rounded-sm border-input text-brand-600 focus-visible:ring-2 focus-visible:ring-input"
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
