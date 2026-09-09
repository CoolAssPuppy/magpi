'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { ActionState } from '@/lib/actions/state';
import type { DreamOutputView } from '@/lib/dreams/queries';

function DeleteOutput({
  documentId,
  onDelete,
}: {
  documentId: string;
  onDelete: (documentId: string) => Promise<ActionState<undefined>>;
}) {
  const [isOpen, setOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const remove = () => {
    setFailure(null);
    startTransition(async () => {
      const result = await onDelete(documentId);
      if (result.status === 'error') setFailure(result.message);
      else setOpen(false);
    });
  };

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm">
            Delete this document
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this dream document?</DialogTitle>
            <DialogDescription>
              This removes the document the run wrote. The documents it was written from are not
              touched, and the run stays in the list with its record of what it read.
            </DialogDescription>
          </DialogHeader>
          {failure ? (
            <p role="alert" className="text-sm text-destructive-600">
              {failure}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button variant="destructive" size="sm" disabled={isPending} onClick={remove}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * There is no uncited synthesis. An output document that cites nothing is
 * reported as having produced nothing, and its text is not rendered at all.
 */
export function DreamOutput({
  output,
  onDelete,
}: {
  output: DreamOutputView;
  onDelete: (documentId: string) => Promise<ActionState<undefined>>;
}) {
  switch (output.kind) {
    case 'none':
      return (
        <p className="max-w-[var(--measure-prose)] text-sm text-tertiary-foreground">
          This run wrote no document.
        </p>
      );

    case 'uncited':
      return (
        <div className="flex flex-col items-start gap-3">
          <div
            role="status"
            className="rounded-[var(--radius-panel)] border border-border-warning bg-warning-200 px-4 py-3"
          >
            <p className="max-w-[var(--measure-prose)] text-sm text-warning-600">
              This run produced nothing. It wrote a document that cites no source, and Magpi does
              not show synthesis it cannot trace back to a chunk.
            </p>
          </div>
          <DeleteOutput documentId={output.documentId} onDelete={onDelete} />
        </div>
      );

    case 'sources-gone':
      return (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-heading text-base font-medium text-foreground">{output.title}</h2>
            <DeleteOutput documentId={output.documentId} onDelete={onDelete} />
          </div>

          <p className="max-w-[var(--measure-prose)] text-sm leading-relaxed whitespace-pre-wrap text-foreground">
            {output.body}
          </p>

          <div
            role="status"
            className="rounded-[var(--radius-panel)] border border-border bg-card px-4 py-3"
          >
            <p className="max-w-[var(--measure-prose)] text-sm text-muted-foreground">
              The {output.citedCount} source{output.citedCount === 1 ? '' : 's'} this digest was
              built from {output.citedCount === 1 ? 'has' : 'have'} since been deleted or
              re-imported. The run cited {output.citedCount === 1 ? 'it' : 'them'} when it wrote
              this.
            </p>
          </div>
        </div>
      );

    case 'cited':
      return (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-heading text-base font-medium text-foreground">{output.title}</h2>
            <DeleteOutput documentId={output.documentId} onDelete={onDelete} />
          </div>

          <p className="max-w-[var(--measure-prose)] text-sm leading-relaxed whitespace-pre-wrap text-foreground">
            {output.body}
          </p>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">Sources</h3>
            <ol className="divide-y divide-border rounded-[var(--radius-panel)] border border-border">
              {output.sources.map((source) => (
                <li key={source.chunkId} id={`source-${source.index}`} className="px-4 py-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-tertiary-foreground">{source.index}</span>
                    <Link
                      href={`/documents/${source.documentId}`}
                      className="text-sm text-brand-link hover:underline"
                    >
                      {source.documentTitle}
                    </Link>
                  </div>
                  <p className="mt-1 max-w-[var(--measure-prose)] text-sm text-muted-foreground">
                    {source.excerpt}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      );

    default: {
      const unhandled: never = output;
      throw new Error(`Unhandled dream output: ${JSON.stringify(unhandled)}`);
    }
  }
}
