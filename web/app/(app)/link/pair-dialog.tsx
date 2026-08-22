"use client";

import { Dialog } from "@/components/dialog";
import type { BadgeRow } from "@/lib/rows";

import { BadgeList } from "./badge-list";
import { PairingCard } from "./pairing-card";

/**
 * Pairing, in a dialog rather than on a page of its own.
 *
 * It is a thing you do about twice: once when the badge arrives and once if
 * you ever revoke it. A permanent section for that is a section that is empty
 * every other day.
 */
export function PairBadgeDialog({
  badges,
  label = "Link a badge",
  defaultOpen = false,
}: {
  badges: BadgeRow[];
  label?: string;
  defaultOpen?: boolean;
}) {
  return (
    <Dialog
      title="Link a badge"
      defaultOpen={defaultOpen}
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className="rounded-panel bg-action px-lg py-sm font-display text-action-ink text-sm font-medium"
        >
          {label}
        </button>
      )}
    >
      {() => (
        <div className="gap-xl flex w-[420px] max-w-full flex-col">
          <PairingCard />
          <BadgeList badges={badges} />
        </div>
      )}
    </Dialog>
  );
}
