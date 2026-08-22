import type { Metadata } from "next";

import { FoldedMagpie, MagpieMark } from "@/components/magpie-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { safeNextPath } from "@/lib/redirects";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in to Magpi" };

const ERRORS: Record<string, string> = {
  github: "GitHub did not complete the sign in. Try again.",
  exchange: "That link has already been used. Ask for a new one.",
  missing_code: "That link is incomplete. Ask for a new one.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const errorKey = typeof params.error === "string" ? params.error : null;
  const errorMessage = errorKey ? ERRORS[errorKey] : null;

  return (
    <main className="flex min-h-screen">
      <div className="gap-xl px-2xl py-4xl lg:px-5xl flex w-full flex-col justify-center lg:w-[620px] lg:shrink-0">
        <div className="gap-md flex items-center">
          <MagpieMark />
          <span className="font-display text-md font-bold">Magpi</span>
        </div>
        <h1 className="font-display text-3xl font-bold leading-tight">Sign in</h1>
        <p className="text-md leading-prose text-ink-muted max-w-prose">
          One click, and your badge is yours.
        </p>
        {errorMessage ? (
          <p role="alert" className="border-l-edge border-critical bg-surface px-lg py-md text-sm">
            {errorMessage}
          </p>
        ) : null}
        <LoginForm next={next} />
        <ThemeToggle />
      </div>
      <div className="border-border bg-surface hidden flex-1 items-center justify-center border-l lg:flex">
        <FoldedMagpie className="w-full max-w-[520px]" />
      </div>
    </main>
  );
}
