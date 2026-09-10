'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import type { ActionState } from '@/lib/actions/state';
import type { ScopeRoutes, ScopeSelection } from '@/lib/connections/scope-selection';
import type { ConnectionStatusView } from '@/lib/connections/status';

import { ScopePicker, type RoutableSpace } from './scope-picker';

export type ConnectionScope = {
  readonly id: string;
  readonly account: string;
  readonly status: ConnectionStatusView;
  readonly selection: ScopeSelection;
};

export type SaveScope = (
  connectionId: string,
  routes: ScopeRoutes,
) => Promise<ActionState<ScopeSelection>>;

const NO_ROUTES: ScopeRoutes = {};

function sameRoutes(left: ScopeRoutes, right: ScopeRoutes): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((k) => left[k] === right[k]);
}

export function ScopeEditor({
  connection,
  spaces,
  onSaveScope,
}: {
  connection: ConnectionScope;
  spaces: readonly RoutableSpace[];
  onSaveScope: SaveScope;
}) {
  // The saved routing replaces what is on screen, since a route to a dead space is not stored.
  const [selection, setSelection] = useState<ScopeSelection>(connection.selection);
  const [routes, setRoutes] = useState<ScopeRoutes>(
    connection.selection.kind === 'set' ? connection.selection.routes : NO_ROUTES,
  );
  const [failure, setFailure] = useState<string | null>(null);
  const [isSaved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const saved = selection.kind === 'set' ? selection.routes : NO_ROUTES;
  const isChanged = !sameRoutes(saved, routes);

  const save = () => {
    setFailure(null);
    setSaved(false);
    startTransition(async () => {
      const result = await onSaveScope(connection.id, routes);
      if (result.status === 'error') {
        setFailure(result.message);
        return;
      }
      if (result.status === 'success') {
        setSelection(result.data);
        setRoutes(result.data.kind === 'set' ? result.data.routes : NO_ROUTES);
        setSaved(true);
      }
    });
  };

  return (
    // The row above already names the account and the status, so this starts at the routing.
    <div className="flex flex-col gap-3 pt-3">
      <ScopePicker
        selection={selection}
        routes={routes}
        spaces={spaces}
        onChange={setRoutes}
        disabled={isPending}
      />

      {isChanged ? (
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={isPending} onClick={save}>
            Save routing
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
