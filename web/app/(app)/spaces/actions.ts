'use server';

import { z } from 'zod';

import { databaseErrorState } from '@/lib/actions/database-error';
import { errorState, successState, type ActionState } from '@/lib/actions/state';
import { withSession } from '@/lib/actions/with-session';
import { setSpaceDreaming } from '@/lib/spaces/dreaming';

const createSpaceSchema = z.object({
  name: z.string().trim().min(1, 'A space needs a name.').max(120),
});

const spaceIdSchema = z.object({ spaceId: z.uuid() });

const addMemberSchema = spaceIdSchema.extend({ userId: z.uuid() });

const dreamingSchema = spaceIdSchema.extend({ enabled: z.boolean() });

export async function createTeamSpace(formData: FormData): Promise<ActionState<{ id: string }>> {
  return withSession(async ({ supabase, orgId, userId }) => {
    const parsed = createSpaceSchema.safeParse({ name: formData.get('name') });
    if (!parsed.success) return errorState(parsed.error.issues[0].message);

    const { data, error } = await supabase
      .from('spaces')
      .insert({ org_id: orgId, kind: 'team', name: parsed.data.name })
      .select('id')
      .single();

    if (error) {
      return databaseErrorState('creating a team space', error, {
        fallback: 'That space could not be created.',
      });
    }

    // The creator is not a member by construction, so join them in the same action.
    const { error: joinError } = await supabase
      .from('space_members')
      .insert({ space_id: data.id, user_id: userId });

    if (joinError) {
      return databaseErrorState('joining a new team space', joinError, {
        fallback: 'The space was created but you were not added to it.',
      });
    }

    return successState({ id: data.id });
  }, '/spaces');
}

export async function addSpaceMember(formData: FormData): Promise<ActionState<undefined>> {
  return withSession(async ({ supabase }) => {
    const parsed = addMemberSchema.safeParse({
      spaceId: formData.get('spaceId'),
      userId: formData.get('userId'),
    });
    if (!parsed.success) return errorState('That member could not be added.');

    const { error } = await supabase
      .from('space_members')
      .insert({ space_id: parsed.data.spaceId, user_id: parsed.data.userId });

    if (error) {
      return databaseErrorState('adding a space member', error, {
        fallback: 'That member could not be added.',
        byCode: { '23505': 'They are already in this space.' },
      });
    }
    return successState(undefined);
  }, '/spaces');
}

export async function removeSpaceMember(formData: FormData): Promise<ActionState<undefined>> {
  return withSession(async ({ supabase }) => {
    const parsed = addMemberSchema.safeParse({
      spaceId: formData.get('spaceId'),
      userId: formData.get('userId'),
    });
    if (!parsed.success) return errorState('That member could not be removed.');

    const { error } = await supabase
      .from('space_members')
      .delete()
      .eq('space_id', parsed.data.spaceId)
      .eq('user_id', parsed.data.userId);

    if (error) {
      return databaseErrorState('removing a space member', error, {
        fallback: 'That member could not be removed.',
      });
    }
    return successState(undefined);
  }, '/spaces');
}

export async function setDreaming(formData: FormData): Promise<ActionState<undefined>> {
  return withSession(async ({ supabase }) => {
    const parsed = dreamingSchema.safeParse({
      spaceId: formData.get('spaceId'),
      enabled: formData.get('enabled') === 'true',
    });
    if (!parsed.success) return errorState('That setting could not be changed.');

    const result = await setSpaceDreaming(supabase, parsed.data.spaceId, parsed.data.enabled);
    if (!result.ok) return errorState(result.error);
    return successState(undefined);
  }, '/spaces');
}
