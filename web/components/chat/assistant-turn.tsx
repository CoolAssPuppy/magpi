import Link from 'next/link';

import { splitAnswer } from '@/lib/chat/inline-citations';
import type { Citation } from '@/lib/chat/protocol';

type AssistantTurnProps = {
  readonly content: string;
  readonly citations: readonly Citation[];
  readonly streaming: boolean;
};

export function AssistantTurn({ content, citations, streaming }: AssistantTurnProps) {
  const segments = splitAnswer(content, citations);
  const citedLabels = new Set(
    segments.flatMap((segment) => (segment.kind === 'citation' ? [segment.label] : [])),
  );
  const cited = citations.filter((_, index) => citedLabels.has(index + 1));

  if (segments.length === 0 && streaming) {
    return <p className="text-sm text-tertiary-foreground">Reading your documents...</p>;
  }

  return (
    <div className="max-w-[var(--measure-prose)]">
      <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
        {segments.map((segment, index) =>
          segment.kind === 'text' ? (
            <span key={index}>{segment.text}</span>
          ) : (
            <Link
              key={index}
              href={`/documents/${segment.citation.documentId}`}
              title={segment.citation.documentTitle}
              className="mx-0.5 rounded-[var(--radius-panel)] bg-muted px-1.5 py-0.5 align-baseline text-xs text-brand-link hover:bg-secondary"
            >
              {segment.label}
            </Link>
          ),
        )}
        {streaming ? (
          <span
            aria-hidden
            className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-tertiary-foreground motion-reduce:animate-none"
          />
        ) : null}
      </p>

      {cited.length > 0 ? <Sources citations={cited} /> : null}
    </div>
  );
}

function Sources({ citations }: { citations: readonly Citation[] }) {
  return (
    <section className="mt-4 border-t border-border pt-3">
      <h3 className="text-xs font-medium text-tertiary-foreground">Sources</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {citations.map((citation) => (
          <li key={citation.chunkId}>
            <Link
              href={`/documents/${citation.documentId}`}
              className="block rounded-[var(--radius-panel)] px-2 py-1.5 transition-colors hover:bg-muted motion-reduce:transition-none"
            >
              <span className="block text-sm text-foreground">{citation.documentTitle}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-tertiary-foreground">
                {citation.excerpt}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
