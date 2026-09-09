import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/app/empty-state';
import { DreamRunList } from '@/components/dreams/dream-run-list';
import { SpaceDreaming } from '@/components/dreams/space-dreaming';
import { loadDreamsPage } from '@/lib/dreams/queries';
import { getSessionContext } from '@/lib/supabase/context';

import { setSpaceDreaming, startDreamRun } from './actions';

export default async function DreamsPage() {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const { runs, spaces } = await loadDreamsPage(context);

  return (
    <>
      <SpaceDreaming spaces={spaces} onToggle={setSpaceDreaming} onRun={startDreamRun} />

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-sm font-medium text-foreground">Runs</h2>
        {runs.length === 0 ? (
          <EmptyState
            title="Nothing has been dreamed yet"
            description="Runs appear here after the first overnight pass, or as soon as you run one by hand above. Every run records what it read, how long it took and what it wrote."
          />
        ) : (
          <DreamRunList runs={runs} />
        )}
      </section>
    </>
  );
}
