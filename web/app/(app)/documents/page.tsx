import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/app/empty-state';
import { PageHeader } from '@/components/app/page-header';
import { DocumentList } from '@/components/documents/document-list';
import { UploadPanel } from '@/components/documents/upload-panel';
import { listDocuments } from '@/lib/documents/documents';
import { listSpaceOptions } from '@/lib/spaces/spaces';
import { getSessionContext } from '@/lib/supabase/context';

export const metadata = { title: 'Documents' };

export default async function DocumentsPage() {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const [documents, spaces] = await Promise.all([
    listDocuments(context.supabase),
    listSpaceOptions(context.supabase),
  ]);

  return (
    <>
      <PageHeader
        title="Documents"
        description="Drop files in, or connect a source. Progress and failures show here as they happen."
      />

      <UploadPanel spaces={spaces} />

      {documents.length === 0 ? (
        <EmptyState
          title="Nothing in here yet"
          description="Upload a file above and Magpi reads it, splits it up, and makes it answerable. A connected source does the same thing on a schedule."
        />
      ) : (
        <DocumentList documents={documents} />
      )}
    </>
  );
}
