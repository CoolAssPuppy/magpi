"use client";

import { signInWithGitHub } from "./actions";

/**
 * GitHub is the only way in.
 *
 * A magic link is a second account for the same person, a second set of
 * failure modes, and a mailbox to babysit. Everyone this is built for already
 * has a GitHub account.
 */
export function LoginForm({ next }: { next: string }) {
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
    </div>
  );
}
