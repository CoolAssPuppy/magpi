'use client';

import { useState, useTransition } from 'react';

import { StatusPill } from '@/components/app/status-pill';
import { Button } from '@/components/ui/button';
import type { ActionState } from '@/lib/actions/state';
import type { ScopeSelection } from '@/lib/connections/scope-selection';
import type { ConnectionStatusView } from '@/lib/connections/status';

import { ScopePicker } from './scope-picker';

export type ConnectionScope = {
  readonly id: string;
  readonly spaceId: string;
  readonly spaceName: string;
  readonly account: string;
  readonly status: ConnectionStatusView;
  readonly selection: ScopeSelection;
};

export type SaveScope = (
  connectionId: string,
  selected: readonly string[],
) => Promise<ActionState<ScopeSelection>>;

export function ScopeEditor({
  connection,
  onSaveScope,
}: {
  connection: ConnectionScope;
  onSaveScope: SaveScope;
}) {
  // The saved selection replaces what is on screen, since dropped ids are not saved.
  const [selection, setSelection] = useState<ScopeSelection>(connection.selection);
  const [selected, setSelected] = useState<readonly string[]>(
    connection.selection.kind === 'set' ? connection.selection.selected : [],
  );
  const [failure, setFailure] = useState<string | null>(null);
  const [isSaved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const save = () => {
    setFailure(null);
    setSaved(false);
    startTransition(async () => {
      const result = await onSaveScope(connection.id, selected);
      if (result.status === 'error') {
        setFailure(result.message);
        return;
      }
      if (result.status === 'success') {
        setSelection(result.data);
        setSelected(result.data.kind === 'set' ? result.data.selected : []);
        setSaved(true);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={connection.status.tone} label={connection.status.label} />
        <span className="text-sm text-foreground">{connection.spaceName}</span>
        <span className="text-xs text-tertiary-foreground">{connection.account}</span>
      </div>
      <p className="max-w-[var(--measure-prose)] text-sm text-muted-foreground">
        {connection.status.reason}
      </p>

      <ScopePicker
        selection={selection}
        selected={selected}
        onChange={setSelected}
        disabled={isPending}
      />

      {selection.kind === 'set' && selection.selectionKind !== 'workspace' ? (
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={isPending} onClick={save}>
            Save selection
          </Button>
          {isSaved ? <span className="text-xs text-tertiary-foreground">Saved</span> : null}
        </div>
      ) : null}

      {failure ? (
        <p role="alert" className="text-sm text-destructive-600">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
