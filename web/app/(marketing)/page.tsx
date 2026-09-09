import Link from 'next/link';

import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Recall',
  description: 'A team knowledge base with a chat interface.',
};

const SOURCES = ['Notion', 'Linear', 'Slack', 'Google Drive', 'Direct upload'] as const;

export default function LandingPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-5 py-20">
      <section className="max-w-[var(--measure-prose)]">
        <h1 className="font-heading text-foreground text-4xl leading-[1.1] font-medium tracking-tight">
          Ask your team&apos;s knowledge base a question.
        </h1>
        <p className="text-foreground-light mt-5 text-base">
          Recall reads Notion, Linear, Slack and Google Drive, and answers in a conversation with
          citations back to the source. Overnight it re-reads what came in, links what is about the
          same thing, and writes a digest.
        </p>
        <div className="mt-8 flex items-center gap-3">
          <Button asChild>
            <Link href="/sign-up">Create an account</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="https://github.com/supabase-community/recall">Read the source</Link>
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-foreground text-lg font-medium">Where it reads from</h2>
        <ul className="flex flex-wrap gap-2">
          {SOURCES.map((source) => (
            <li
              key={source}
              className="border-border text-foreground-light rounded-[var(--radius-panel)] border px-3 py-1.5 text-sm"
            >
              {source}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-10 md:grid-cols-3">
        <div>
          <h3 className="font-heading text-foreground text-base font-medium">
            Every document lives in one space
          </h3>
          <p className="text-foreground-lighter mt-2 text-sm">
            Personal, team, or everyone. You pick when you put it in, and that is the whole
            permission model.
          </p>
        </div>
        <div>
          <h3 className="font-heading text-foreground text-base font-medium">
            Answers cite their sources
          </h3>
          <p className="text-foreground-lighter mt-2 text-sm">
            Citations are stored as chunk ids and resolved when you read the message, so a person
            who lost access to a space stops seeing the quote.
          </p>
        </div>
        <div>
          <h3 className="font-heading text-foreground text-base font-medium">It dreams overnight</h3>
          <p className="text-foreground-lighter mt-2 text-sm">
            Dreaming is a nightly pass that re-reads the day, extracts entities, links documents
            about the same thing, and writes a digest back into the space.
          </p>
        </div>
      </section>
    </div>
  );
}
