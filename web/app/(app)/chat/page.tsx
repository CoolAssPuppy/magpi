import Link from 'next/link';
import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/app/empty-state';
import { PageHeader } from '@/components/app/page-header';
import { NewConversation } from '@/components/chat/new-conversation';
import { Button } from '@/components/ui/button';
import { getSessionContext } from '@/lib/supabase/context';

export default async function ChatPage() {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const [spaces, documents] = await Promise.all([
    context.supabase.from('spaces').select('id, name').order('name'),
    context.supabase.from('documents').select('id', { count: 'exact', head: true }),
  ]);

  const hasDocuments = (documents.count ?? 0) > 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Ask your knowledge base"
        description="Every answer cites the document it came from."
      />

      {hasDocuments ? null : <FirstRun />}

      <NewConversation spaces={spaces.data ?? []} />
    </div>
  );
}

function FirstRun() {
  return (
    <EmptyState
      title="No documents yet"
      description="Upload a document or connect a source to get started."
      action={
        <div className="flex items-center gap-2">
          <Button asChild size="sm">
            <Link href="/documents">Upload a document</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/connections">Connect a source</Link>
          </Button>
        </div>
      }
    />
  );
}
