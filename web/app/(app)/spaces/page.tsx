import { EmptyState } from '@/components/app/empty-state';
import { PageHeader } from '@/components/app/page-header';
import { CreateSpaceForm } from '@/components/spaces/create-space-form';
import { SpaceList } from '@/components/spaces/space-list';
import { listVisibleSpaces } from '@/lib/spaces/spaces';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Spaces' };

export default async function SpacesPage() {
  const supabase = await createClient();
  const spaces = await listVisibleSpaces(supabase);

  return (
    <>
      <PageHeader
        title="Spaces"
        description="Every document lives in exactly one space. You pick which when you put it in, and that is the whole permission model."
      />

      <div className="max-w-md">
        <CreateSpaceForm />
      </div>

      {spaces.length === 0 ? (
        <EmptyState
          title="No spaces yet"
          description="You should have a personal space and an organization space already. If neither is here, sign out and back in to rebuild them."
        />
      ) : (
        <SpaceList spaces={spaces} />
      )}
    </>
  );
}
