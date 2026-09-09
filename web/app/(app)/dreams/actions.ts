'use server';

import { z } from 'zod';

import { errorState, successState, type ActionState } from '@/lib/actions/state';
import { withSession } from '@/lib/actions/with-session';
import { requestDreamRun } from '@/lib/dreams/edge';

const DREAMS_PATH = '/dreams';

const idSchema = z.uuid();
const kindSchema = z.enum(['entities', 'digest', 'connections']);

/**
 * The manual trigger. A scheduled run and this one do the same work, which is
 * also how the product is shown without waiting for a cron.
 */
export async function startDreamRun(
  spaceId: string,
  kind: 'entities' | 'digest' | 'connections',
): Promise<ActionState<undefined>> {
  const input = z.object({ spaceId: idSchema, kind: kindSchema }).safeParse({ spaceId, kind });
  if (!input.success) return errorState('That is not a space and a kind of dream Recall runs.');

  return withSession(async (context) => {
    const { data: space } = await context.supabase
      .from('spaces')
      .select('id, dreaming_enabled')
      .eq('id', input.data.spaceId)
      .maybeSingle();
    if (!space) return errorState('That space is not one you can run a dream in.');
    if (!space.dreaming_enabled) {
      return errorState('Dreaming is switched off for this space. Turn it on first.');
    }

    const result = await requestDreamRun(context.supabase, {
      spaceId: input.data.spaceId,
      kind: input.data.kind,
    });
    return result.ok ? successState(undefined) : errorState(result.error);
  }, DREAMS_PATH);
}

export async function setSpaceDreaming(
  spaceId: string,
  enabled: boolean,
): Promise<ActionState<undefined>> {
  const input = z
    .object({ spaceId: idSchema, enabled: z.boolean() })
    .safeParse({ spaceId, enabled });
  if (!input.success) return errorState('That is not a space.');

  return withSession(async (context) => {
    const { error } = await context.supabase
      .from('spaces')
      .update({ dreaming_enabled: input.data.enabled })
      .eq('id', input.data.spaceId);
    if (error) return errorState('Dreaming could not be changed for that space.');
    return successState(undefined);
  }, DREAMS_PATH);
}

async function decideDreamLink(
  linkId: string,
  decision: { confirmed_at: string | null; dismissed_at: string | null },
  refusal: string,
): Promise<ActionState<undefined>> {
  const input = idSchema.safeParse(linkId);
  if (!input.success) return errorState('That is not a candidate link.');

  return withSession(async (context) => {
    const { error } = await context.supabase
      .from('dream_links')
      .update(decision)
      .eq('id', input.data);
    if (error) return errorState(refusal);
    return successState(undefined);
  }, DREAMS_PATH);
}

export async function confirmDreamLink(linkId: string): Promise<ActionState<undefined>> {
  return decideDreamLink(
    linkId,
    { confirmed_at: new Date().toISOString(), dismissed_at: null },
    'That link could not be confirmed.',
  );
}

export async function dismissDreamLink(linkId: string): Promise<ActionState<undefined>> {
  return decideDreamLink(
    linkId,
    { confirmed_at: null, dismissed_at: new Date().toISOString() },
    'That link could not be dismissed.',
  );
}

/**
 * Deletes a dream output and nothing else. The documents_delete_dream policy
 * narrows this to origin = 'dream', so a request naming a source document is
 * refused by the database rather than by this function.
 */
export async function deleteDreamOutput(documentId: string): Promise<ActionState<undefined>> {
  const input = idSchema.safeParse(documentId);
  if (!input.success) return errorState('That is not a document.');

  return withSession(async (context) => {
    const { data, error } = await context.supabase
      .from('documents')
      .delete()
      .eq('id', input.data)
      .select('id');
    if (error) return errorState('That document could not be deleted.');
    if (!data || data.length === 0) {
      return errorState('Only a document a dream wrote can be deleted here.');
    }
    return successState(undefined);
  }, DREAMS_PATH);
}
