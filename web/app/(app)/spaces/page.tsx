import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/app/empty-state';
import { PageHeader } from '@/components/app/page-header';
import { CreateSpaceDialog } from '@/components/spaces/create-space-dialog';
import { SpaceList } from '@/components/spaces/space-list';
import { listVisibleSpaces } from '@/lib/spaces/spaces';
import { getSessionContext } from '@/lib/supabase/context';

export const metadata = { title: 'Spaces' };

export default async function SpacesPage() {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const spaces = await listVisibleSpaces(context.supabase);

  return (
    <>
      <PageHeader
        title="Spaces"
        description="Every document lives in exactly one space. You choose the space when you add the document."
        actions={<CreateSpaceDialog />}
      />

      {spaces.length === 0 ? (
        <EmptyState
          title="No spaces yet"
          description="Sign out and back in if your personal space is missing."
        />
      ) : (
        <SpaceList spaces={spaces} />
      )}
    </>
  );
}
