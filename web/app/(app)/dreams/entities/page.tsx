import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/app/empty-state';
import { EntityGroups } from '@/components/dreams/entity-groups';
import { loadEntities } from '@/lib/dreams/queries';
import { getSessionContext } from '@/lib/supabase/context';

export default async function EntitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ space?: string }>;
}) {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const { space } = await searchParams;
  const { groups } = await loadEntities(context, space);

  return (
    <>
      <p className="max-w-[var(--measure-prose)] text-sm text-tertiary-foreground">
        The people, projects, customers and decisions the entities dream found, each with the
        documents it was mentioned in.
      </p>

      {groups.length === 0 ? (
        <EmptyState
          title="No entities yet"
          description="An entities run reads the documents that arrived recently and pulls out what they are about. Run one from the Runs tab, or wait for tonight."
        />
      ) : (
        <EntityGroups groups={groups} />
      )}
    </>
  );
}
