"use client";

import { useActionState, useState } from "react";

import { IDLE } from "@/lib/actions/state";
import type { BadgeRow } from "@/lib/rows";

import { renameBadgeAction, revokeBadgeAction } from "./actions";

export function BadgeList({ badges }: { badges: BadgeRow[] }) {
  return (
    <section className="border-border flex flex-col border-t">
      <header className="py-md flex items-center justify-between">
        <h2 className="font-display text-2xs text-ink-faint tracking-wide">YOUR BADGES</h2>
        <span className="font-display text-2xs text-ink-faint">{badges.length}</span>
      </header>
      {badges.length === 0 ? (
        <p className="pb-md text-ink-faint text-sm">Nothing paired yet.</p>
      ) : (
        <ul>
          {badges.map((badge) => (
            <BadgeRowItem key={badge.id} badge={badge} />
          ))}
        </ul>
      )}
    </section>
  );
}

function BadgeRowItem({ badge }: { badge: BadgeRow }) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameState, rename, isSavingName] = useActionState(renameBadgeAction, IDLE);
  const [revokeState, revokeBadge, isRevoking] = useActionState(revokeBadgeAction, IDLE);

  return (
    <li className="gap-sm border-border px-lg py-lg flex flex-col border-b last:border-b-0">
      <div className="gap-md flex items-center">
        <span
          className={
            isLive(badge)
              ? "size-sm rounded-pill bg-accent"
              : "size-sm rounded-pill bg-border-strong"
          }
        />

        {isRenaming ? (
          <form action={rename} className="gap-sm flex flex-1 items-center">
            <input type="hidden" name="badge_id" value={badge.id} />
            <input
              name="label"
              defaultValue={badge.label ?? ""}
              maxLength={40}
              autoFocus
              aria-label="Badge name"
              className="rounded-square border-focus bg-background px-sm py-2xs font-display flex-1 border text-base"
            />
            <button
              type="submit"
              disabled={isSavingName}
              className="font-display text-accent text-sm disabled:opacity-50"
            >
              {isSavingName ? "Saving" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setIsRenaming(false)}
              className="font-display text-ink-faint text-sm"
            >
              Cancel
            </button>
          </form>
        ) : (
          <>
            <div className="gap-3xs flex flex-1 flex-col">
              <span className="font-display text-md">{badge.label ?? "Unnamed badge"}</span>
              <span className="text-ink-faint text-xs">
                {badge.badge_uid.slice(0, 8)}
                {badge.fw ? ` · firmware ${badge.fw}` : ""}
                {` · ${seenLabel(badge.last_seen_at)}`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsRenaming(true)}
              className="text-ink-muted hover:text-ink w-[70px] shrink-0 text-right text-sm"
            >
              Rename
            </button>
            <form action={revokeBadge} className="w-[66px] shrink-0 text-right">
              <input type="hidden" name="badge_id" value={badge.id} />
              <button
                type="submit"
                disabled={isRevoking}
                className="text-critical text-sm disabled:opacity-50"
              >
                {isRevoking ? "Revoking" : "Revoke"}
              </button>
            </form>
          </>
        )}
      </div>

      {renameState.status !== "idle" || revokeState.status !== "idle" ? (
        <p role="status" className="text-ink-muted text-xs">
          {renameState.status !== "idle" ? renameState.message : null}
          {revokeState.status !== "idle" ? revokeState.message : null}
        </p>
      ) : null}
    </li>
  );
}

function isLive(badge: BadgeRow): boolean {
  return badge.last_seen_at !== null && Date.now() - Date.parse(badge.last_seen_at) < 600_000;
}

function seenLabel(lastSeenAt: string | null): string {
  if (!lastSeenAt) return "never seen";
  const minutes = Math.round((Date.now() - Date.parse(lastSeenAt)) / 60000);
  if (minutes < 1) return "seen just now";
  if (minutes < 60) return `seen ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `seen ${hours}h ago`;
  return `seen ${Math.round(hours / 24)}d ago`;
}
