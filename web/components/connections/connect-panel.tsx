'use client';

import { useId, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import type { ActionState } from '@/lib/actions/state';
import type { ScopeSelection } from '@/lib/connections/scope-selection';
import type { ConnectionStatusView } from '@/lib/connections/status';

import { ScopePicker } from './scope-picker';
import { StatusPill } from '@/components/app/status-pill';

export type ConnectionScope = {
  readonly id: string;
  readonly spaceId: string;
  readonly spaceName: string;
  readonly account: string;
  readonly status: ConnectionStatusView;
  readonly selection: ScopeSelection;
};

export type ProviderSummary = {
  readonly slug: string;
  readonly displayName: string;
  readonly description: string;
  readonly docsUrl: string | null;
  readonly scopeSelectionKind: string | null;
};

export type SpaceOption = { readonly id: string; readonly name: string };

export type SaveScope = (
  connectionId: string,
  selected: readonly string[],
) => Promise<ActionState<ScopeSelection>>;

function ScopeEditor({
  connection,
  onSaveScope,
}: {
  connection: ConnectionScope;
  onSaveScope: SaveScope;
}) {
  // The saved selection replaces what is on screen, because connections-scopes
  // drops an id the provider no longer offers. A tick that was quietly dropped
  // would otherwise sit there reading as saved.
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
        <span className="text-xs text-foreground-lighter">{connection.account}</span>
      </div>
      <p className="max-w-[var(--measure-prose)] text-sm text-foreground-light">
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
          {isSaved ? <span className="text-xs text-foreground-lighter">Saved</span> : null}
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

/**
 * One screen. A connection is bound to exactly one space, so the space it lands
 * in and the channels it reads are chosen together rather than in two steps.
 */
export function ConnectPanel({
  provider,
  spaces,
  connections,
  initialSpaceId,
  onBegin,
  onSaveScope,
}: {
  provider: ProviderSummary;
  spaces: readonly SpaceOption[];
  connections: readonly ConnectionScope[];
  initialSpaceId: string;
  onBegin: (spaceId: string) => Promise<ActionState<undefined>>;
  onSaveScope: SaveScope;
}) {
  const spaceFieldId = useId();
  const [spaceId, setSpaceId] = useState(initialSpaceId);
  const [failure, setFailure] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const begin = () => {
    setFailure(null);
    startTransition(async () => {
      const result = await onBegin(spaceId);
      if (result.status === 'error') setFailure(result.message);
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby={`${spaceFieldId}-heading`} className="flex flex-col gap-3">
        <h2
          id={`${spaceFieldId}-heading`}
          className="font-heading text-sm font-medium text-foreground"
        >
          Add a connection
        </h2>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={spaceFieldId} className="text-sm text-foreground-light">
            Space
          </label>
          <select
            id={spaceFieldId}
            value={spaceId}
            onChange={(event) => setSpaceId(event.target.value)}
            className="h-9 w-full max-w-xs rounded-[var(--radius-panel)] border border-border-strong bg-background-surface-100 px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:outline-none"
          >
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
          <p className="max-w-[var(--measure-prose)] text-xs text-foreground-lighter">
            Everything this connection imports lands in this space, and only people in the space can
            read it.
          </p>
        </div>

        <p className="max-w-[var(--measure-prose)] text-sm text-foreground-lighter">
          You will be sent to {provider.displayName} to authorize Magpi, then brought back here to
          choose what it reads.
        </p>

        <div className="flex items-center gap-3">
          <Button disabled={isPending} onClick={begin}>
            Connect {provider.displayName}
          </Button>
          {provider.docsUrl ? (
            <a
              href={provider.docsUrl}
              className="text-sm text-brand-link hover:underline"
              rel="noreferrer noopener"
              target="_blank"
            >
              What {provider.displayName} gives Magpi
            </a>
          ) : null}
        </div>

        {failure ? (
          <p role="alert" className="text-sm text-destructive-600">
            {failure}
          </p>
        ) : null}
      </section>

      <section aria-label="What Magpi reads" className="flex flex-col gap-1">
        <h2 className="font-heading text-sm font-medium text-foreground">What Magpi reads</h2>
        {connections.length === 0 ? (
          <p className="max-w-[var(--measure-prose)] text-sm text-foreground-lighter">
            There is no connection to {provider.displayName} yet. Once one exists, the channels and
            folders it reads are chosen here.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {connections.map((connection) => (
              <ScopeEditor key={connection.id} connection={connection} onSaveScope={onSaveScope} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
