"use client";

import { useActionState, useState } from "react";

import { IDLE } from "@/lib/actions/state";

import { approveCodeAction } from "./actions";

/**
 * The badge shows a code; you type it here.
 *
 * The badge starts the flow and holds the device code, so nothing on this
 * screen can approve a pairing on its own. Typing the code is the proof that
 * whoever is signed in is also holding the badge.
 */
export function PairingCard() {
  const [code, setCode] = useState("");
  const [state, approve, isApproving] = useActionState(approveCodeAction, IDLE);

  return (
    <section className="gap-xl rounded-panel border-border bg-surface p-2xl flex w-full shrink-0 flex-col items-center border lg:w-[420px]">
      <h2 className="font-display text-2xs text-ink-faint tracking-wide">
        TYPE THE CODE FROM THE BADGE
      </h2>

      <form action={approve} className="gap-lg flex w-full flex-col items-center">
        <input
          name="user_code"
          value={code}
          onChange={(event) => setCode(format(event.target.value))}
          placeholder="XXXX-XXXX"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          aria-label="Pairing code"
          maxLength={9}
          className="rounded-square border-border bg-background px-md py-md font-display tracking-label focus:border-focus w-full border text-center text-4xl uppercase outline-none"
          data-numeric
        />
        <button
          type="submit"
          disabled={isApproving || code.length < 9}
          className="rounded-panel bg-accent px-lg py-md font-display text-accent-ink w-full text-base font-medium disabled:opacity-50"
        >
          {isApproving ? "Pairing" : "Pair this badge"}
        </button>
      </form>

      {state.status === "idle" ? (
        <p className="text-ink-faint text-center text-sm">
          Open Notifier on the badge. It shows a code while it waits.
        </p>
      ) : (
        <p
          role="status"
          className={
            state.status === "error"
              ? "text-critical text-center text-sm"
              : "text-positive text-center text-sm"
          }
        >
          {state.message}
        </p>
      )}
    </section>
  );
}

/**
 * Groups as XXXX-XXXX while you type.
 *
 * The badge draws the code with the dash, so a field that refused one would
 * reject exactly what is on the screen in front of you.
 */
function format(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  if (cleaned.length <= 4) return cleaned;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
}
