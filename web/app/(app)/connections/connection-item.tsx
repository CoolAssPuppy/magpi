"use client";

import { useActionState, useState } from "react";

import { PencilIcon, RefreshIcon, TrashIcon } from "@/components/icons";
import { IDLE } from "@/lib/actions/state";
import type { ConnectionRow } from "@/lib/rows";

import { beginOAuthAction, disconnectAction, renameConnectionAction } from "./actions";

/**
 * One connected account under its provider.
 *
 * Three things you can do to an account, and they are the same three for every
 * provider, so they are icons rather than a row of words repeated seven times.
 * Each still carries a name, because a screen reader gets nothing from a
 * pencil.
 */
export function ConnectionItem({
  connection,
  kind,
}: {
  connection: ConnectionRow;
  kind: "oauth" | "api_key";
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [state, rename, isRenaming] = useActionState(renameConnectionAction, IDLE);
  const [, remove, isRemoving] = useActionState(disconnectAction, IDLE);

  const name = connection.label ?? connection.external_account ?? "Unnamed";

  if (isEditing) {
    return (
      <li className="gap-md border-border py-sm flex items-center border-t">
        <form action={rename} className="gap-sm flex flex-1 items-center">
          <input type="hidden" name="connection_id" value={connection.id} />
          <input
            name="label"
            defaultValue={connection.label ?? ""}
            placeholder="Work"
            maxLength={24}
            autoFocus
            aria-label="Connection name"
            className="rounded-square border-border bg-background px-md py-2xs w-[180px] border text-sm"
          />
          <button type="submit" disabled={isRenaming} className="font-display text-accent text-sm">
            {isRenaming ? "Saving" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="text-ink-muted hover:text-ink text-sm"
          >
            Cancel
          </button>
          {state.status === "error" ? (
            <span role="status" className="text-critical text-xs">
              {state.message}
            </span>
          ) : null}
        </form>
      </li>
    );
  }

  return (
    <li className="gap-md border-border py-sm flex items-center border-t">
      <span
        className={`size-sm rounded-pill shrink-0 ${
          connection.status === "error" ? "bg-critical" : "bg-accent"
        }`}
      />
      <span className="font-display flex-1 text-sm">{name}</span>

      {connection.status === "error" ? (
        <span className="text-critical shrink-0 text-xs">{connection.error_message}</span>
      ) : null}

      <div className="gap-xs text-ink-muted flex shrink-0 items-center">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          aria-label="Rename"
          className={ICON}
        >
          <PencilIcon />
        </button>

        {/* Reconnect replaces this account's token rather than adding another,
            which is why the connection travels with the flow. */}
        {kind === "oauth" ? (
          <form action={beginOAuthAction}>
            <input type="hidden" name="provider" value={connection.provider} />
            <input type="hidden" name="connection_id" value={connection.id} />
            <button type="submit" aria-label="Reconnect" className={ICON}>
              <RefreshIcon />
            </button>
          </form>
        ) : null}

        <form action={remove}>
          <input type="hidden" name="connection_id" value={connection.id} />
          <button
            type="submit"
            disabled={isRemoving}
            aria-label="Remove"
            className={`${ICON} hover:text-critical disabled:opacity-50`}
          >
            <TrashIcon />
          </button>
        </form>
      </div>
    </li>
  );
}

const ICON = "rounded-hairline p-2xs hover:text-ink flex items-center";
