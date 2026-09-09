import Link from 'next/link';

import { FoldedMagpie } from '@/components/brand/magpie-mark';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Magpi',
  description: 'Ask your team documents a question and get a cited answer.',
};

const SOURCES = ['Notion', 'Linear', 'Slack', 'Google Drive', 'Direct upload'] as const;

export default function LandingPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-20 px-5 py-16 md:py-24">
      {/*
        The bird sits beside the sentence rather than above it, so on a wide
        screen the eye lands on the fold and reads across. It drops below on
        narrow screens because a 660-wide drawing shrunk to phone width stops
        being legible as paper.
      */}
      <section className="flex flex-col-reverse items-center gap-12 md:flex-row md:items-center md:gap-16">
        <div className="max-w-[var(--measure-prose)] md:flex-1">
          <h1 className="font-heading text-4xl leading-[1.1] font-medium tracking-tight text-foreground md:text-5xl">
            Ask your team&apos;s knowledge base a question.
          </h1>
          <p className="mt-5 text-base text-muted-foreground">
            Connect Notion, Linear, Slack and Google Drive. Ask a question, get an answer with
            citations to the documents it came from.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild>
              <Link href="/sign-up">Create an account</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="https://github.com/supabase-community/magpi">Read the source</Link>
            </Button>
          </div>
        </div>

        <FoldedMagpie className="w-full max-w-[420px] shrink-0 md:max-w-[520px]" />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-lg font-medium text-foreground">Where it reads from</h2>
        <ul className="flex flex-wrap gap-2">
          {SOURCES.map((source) => (
            <li
              key={source}
              className="rounded-[var(--radius-panel)] border border-border px-3 py-1.5 text-sm text-muted-foreground"
            >
              {source}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-10 md:grid-cols-3">
        <div>
          <h3 className="font-heading text-base font-medium text-foreground">
            Every document lives in one space
          </h3>
          <p className="mt-2 text-sm text-tertiary-foreground">
            Personal, team, or everyone. You choose the space when you add the document.
          </p>
        </div>
        <div>
          <h3 className="font-heading text-base font-medium text-foreground">
            Answers cite their sources
          </h3>
          <p className="mt-2 text-sm text-tertiary-foreground">
            Every citation resolves when you open the message. Lose access to a space and its quotes
            stop appearing.
          </p>
        </div>
        <div>
          <h3 className="font-heading text-base font-medium text-foreground">
            Dreaming runs overnight
          </h3>
          <p className="mt-2 text-sm text-tertiary-foreground">
            A nightly pass re-reads the day, links documents covering the same thing, and writes a
            digest into the space.
          </p>
        </div>
      </section>
    </div>
  );
}
