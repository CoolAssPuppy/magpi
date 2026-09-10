import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/app/page-header';
import { DreamingToggle } from '@/components/spaces/dreaming-toggle';
import { SpaceMembers } from '@/components/spaces/space-members';
import { describeKind } from '@/lib/spaces/spaces';
import { createClient } from '@/lib/supabase/server';

export default async function SpacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: space } = await supabase
    .from('spaces')
    .select('id, name, kind, dreaming_enabled')
    .eq('id', id)
    .maybeSingle();

  // RLS already hid a space the caller is not in, so this covers both cases.
  if (!space) notFound();

  const { data: members } = await supabase
    .from('space_members')
    .select('user_id, created_at')
    .eq('space_id', id)
    .order('created_at');

  const { count: documentCount } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('space_id', id);

  return (
    <>
      <PageHeader
        title={space.name}
        description={`${describeKind(space.kind)}. ${documentCount ?? 0} ${
          documentCount === 1 ? 'document' : 'documents'
        }.`}
      />

      <DreamingToggle spaceId={space.id} enabled={space.dreaming_enabled} />

      <SpaceMembers
        kind={space.kind}
        members={(members ?? []).map((member) => ({
          userId: member.user_id,
          joinedAt: member.created_at,
        }))}
      />
    </>
  );
}
