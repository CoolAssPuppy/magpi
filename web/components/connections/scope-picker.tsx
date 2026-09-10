'use client';

import { ChevronDown } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  describeEmptySelection,
  describeScopeSelection,
  type ScopeRoutes,
  type ScopeSelection,
} from '@/lib/connections/scope-selection';

export type RoutableSpace = {
  readonly id: string;
  readonly name: string;
};

/** Radix Select has no empty value, so "nowhere" is a sentinel rather than an empty string. */
const NOT_ROUTED = 'not-routed';

/** Where each channel, folder or workspace lands. Says so when the source has not listed any. */
export function ScopePicker({
  selection,
  routes,
  spaces,
  onChange,
  disabled = false,
}: {
  selection: ScopeSelection;
  routes: ScopeRoutes;
  spaces: readonly RoutableSpace[];
  onChange: (routes: ScopeRoutes) => void;
  disabled?: boolean;
}) {
  if (selection.kind === 'unset') {
    return (
      <p className="max-w-[var(--measure-prose)] text-sm text-tertiary-foreground">
        This source has not listed what it can read yet. Authorize it and the list appears here.
      </p>
    );
  }

  const route = (unitId: string, spaceId: string) => {
    const next = { ...routes };
    if (spaceId === NOT_ROUTED) delete next[unitId];
    else next[unitId] = spaceId;
    onChange(next);
  };

  const emptyMeaning =
    Object.keys(routes).length === 0 ? describeEmptySelection(selection.selectionKind) : null;

  return (
    // Closed by default. Routing is set once and read at a glance after that.
    <details className="group flex flex-col gap-2">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs text-tertiary-foreground hover:text-foreground">
        {describeScopeSelection({ ...selection, routes })}
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 transition-transform group-open:rotate-180"
        />
      </summary>

      {emptyMeaning ? (
        <p className="mt-2 max-w-[var(--measure-prose)] text-xs text-muted-foreground">
          {emptyMeaning}
        </p>
      ) : null}

      <ul className="mt-2 max-h-72 divide-y divide-border overflow-y-auto rounded-[var(--radius-panel)] border border-border">
        {selection.available.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0 truncate text-sm text-foreground">{item.name}</span>
            <Select
              value={routes[item.id] ?? NOT_ROUTED}
              disabled={disabled}
              onValueChange={(value) => route(item.id, value)}
            >
              <SelectTrigger
                aria-label={`Space for ${item.name}`}
                className="h-8 w-44 shrink-0 text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOT_ROUTED}>Not routed</SelectItem>
                {spaces.map((space) => (
                  <SelectItem key={space.id} value={space.id}>
                    {space.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </li>
        ))}
      </ul>
    </details>
  );
}
