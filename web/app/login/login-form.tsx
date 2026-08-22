"use client";

import { useActionState } from "react";

import { IDLE } from "@/lib/actions/state";

import { sendMagicLink, signInWithGitHub } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, submit, isPending] = useActionState(sendMagicLink, IDLE);

  return (
    <div className="gap-xl flex w-full max-w-prose flex-col">
      <form action={signInWithGitHub}>
        <input type="hidden" name="next" value={next} />
        <button
          type="submit"
          className="rounded-panel bg-invert-ground px-lg py-md font-display text-md text-invert-ink w-full font-medium"
        >
          Continue with GitHub
        </button>
      </form>

      <div className="gap-lg flex items-center">
        <span className="bg-border h-px flex-1" />
        <span className="font-display text-2xs text-ink-faint tracking-wide">OR</span>
        <span className="bg-border h-px flex-1" />
      </div>

      <form action={submit} className="gap-md flex flex-col">
        <input type="hidden" name="next" value={next} />
        <label htmlFor="email" className="font-display text-2xs text-ink-muted tracking-wide">
          EMAIL
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          aria-describedby={state.status === "idle" ? undefined : "magic-link-status"}
          className="rounded-square border-border bg-surface px-md py-md text-md border"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-panel border-border-strong px-lg py-md font-display border text-base disabled:opacity-50"
        >
          {isPending ? "Sending" : "Send a magic link"}
        </button>
        {state.status === "idle" ? null : (
          <p
            id="magic-link-status"
            role="status"
            className={state.status === "error" ? "text-critical text-sm" : "text-positive text-sm"}
          >
            {state.message}
          </p>
        )}
      </form>
    </div>
  );
}
