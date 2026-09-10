import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/app/empty-state';
import { PageHeader } from '@/components/app/page-header';
import { DocumentList } from '@/components/documents/document-list';
import { listDocuments } from '@/lib/documents/documents';
import { getSessionContext } from '@/lib/supabase/context';

export const metadata = { title: 'Documents' };

export default async function DocumentsPage() {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const documents = await listDocuments(context.supabase);

  return (
    <>
      <PageHeader title="Documents" description="All documents stored in your digital brain" />

      {documents.length === 0 ? (
        <EmptyState
          title="Nothing in here yet"
          description="Connect a source, or upload documents from Connections."
        />
      ) : (
        <DocumentList documents={documents} />
      )}
    </>
  );
}
