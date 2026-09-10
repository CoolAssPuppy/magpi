import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/app/page-header';
import { describeIngest, describeOrigin } from '@/lib/documents/documents';
import { createClient } from '@/lib/supabase/server';

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: document } = await supabase
    .from('documents')
    .select('id, title, url, origin, updated_at, space_id, spaces(name)')
    .eq('id', id)
    .maybeSingle();

  // RLS already hid the document, so "not found" and "not allowed" are the same answer.
  if (!document) notFound();

  const [{ data: chunks }, { data: job }] = await Promise.all([
    supabase.from('chunks').select('id, ordinal, content').eq('document_id', id).order('ordinal'),
    supabase
      .from('ingest_jobs')
      .select('status, stage, error')
      .eq('document_id', id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const problem = describeIngest(job ?? null);

  return (
    <>
      <PageHeader
        title={document.title}
        description={`${describeOrigin(document.origin)} into ${document.spaces?.name ?? 'a space'}.`}
      />

      {problem ? <p className="text-sm text-muted-foreground">{problem}</p> : null}

      {document.url ? (
        <a
          href={document.url}
          className="w-fit text-sm text-brand-link underline-offset-4 hover:underline"
        >
          Open the original
        </a>
      ) : null}

      <article className="flex max-w-[var(--measure-prose)] flex-col gap-5">
        {(chunks ?? []).map((chunk) => (
          <p
            key={chunk.id}
            id={`chunk-${chunk.id}`}
            className="text-sm leading-relaxed text-muted-foreground target:bg-brand-200"
          >
            {chunk.content}
          </p>
        ))}
      </article>
    </>
  );
}
