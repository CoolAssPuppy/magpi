"use client";

import { useActionState, useState } from "react";

import { IDLE } from "@/lib/actions/state";
import type { ConnectionRow } from "@/lib/rows";

import { disconnectAction, renameConnectionAction } from "./actions";

/**
 * One connected account under its provider.
 *
 * Two accounts of the same kind is the ordinary case, so each carries a name
 * the wearer chose. It is what the badge prints beside the counter, which is
 * why it is short and why renaming happens here rather than on a settings
 * screen somewhere else.
 */
export function ConnectionItem({ connection }: { connection: ConnectionRow }) {
  const [isEditing, setIsEditing] = useState(false);
  const [state, rename, isRenaming] = useActionState(renameConnectionAction, IDLE);
  const [, remove, isRemoving] = useActionState(disconnectAction, IDLE);

  const name = connection.label ?? connection.external_account ?? "Unnamed";

  return (
    <li className="gap-md border-border py-sm flex items-center border-t">
      <span
        className={`size-sm rounded-pill shrink-0 ${
          connection.status === "error" ? "bg-critical" : "bg-accent"
        }`}
      />

      {isEditing ? (
        <form action={rename} className="gap-sm flex flex-1 items-center">
          <input type="hidden" name="connection_id" value={connection.id} />
          <input
            name="label"
            defaultValue={connection.label ?? ""}
            placeholder="Work"
            maxLength={24}
            autoFocus
            className="rounded-square border-border bg-background px-md py-2xs w-[160px] border text-sm"
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
      ) : (
        <>
          <span className="font-display flex-1 text-sm">{name}</span>
          {connection.status === "error" ? (
            <span className="text-critical shrink-0 text-xs">{connection.error_message}</span>
          ) : null}
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-ink-muted hover:text-ink shrink-0 text-sm"
          >
            Rename
          </button>
        </>
      )}

      <form action={remove} className="shrink-0">
        <input type="hidden" name="connection_id" value={connection.id} />
        <input type="hidden" name="provider" value={connection.provider} />
        <button
          type="submit"
          disabled={isRemoving}
          className="text-ink-muted hover:text-critical text-sm disabled:opacity-50"
        >
          {isRemoving ? "Removing" : "Remove"}
        </button>
      </form>
    </li>
  );
}
