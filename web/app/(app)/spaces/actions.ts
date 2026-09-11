'use server';

import { z } from 'zod';

import { databaseErrorState } from '@/lib/actions/database-error';
import { errorState, successState, type ActionState } from '@/lib/actions/state';
import { withSession } from '@/lib/actions/with-session';
import { setSpaceDreaming } from '@/lib/spaces/dreaming';

const createSpaceSchema = z.object({
  name: z.string().trim().min(1, 'A space needs a name.').max(120),
  description: z.string().trim().max(400).optional(),
});

const spaceIdSchema = z.object({ spaceId: z.uuid() });

const addMemberSchema = spaceIdSchema.extend({ userId: z.uuid() });

const dreamingSchema = spaceIdSchema.extend({ enabled: z.boolean() });

const detailsSchema = z.object({
  spaceId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400),
});

/**
 * Renames one space and rewrites what it is for. Any member may: the policy admits a space the
 * caller can see and the column grant stops org_id and kind moving with it.
 */
export async function updateSpaceDetails(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withSession(
    async ({ supabase }) => {
      const parsed = detailsSchema.safeParse({
        spaceId: formData.get('spaceId'),
        name: formData.get('name'),
        description: formData.get('description') ?? '',
      });
      if (!parsed.success) {
        return errorState('A name is between 1 and 120 characters, a description up to 400.');
      }

      const { error } = await supabase
        .from('spaces')
        .update({
          name: parsed.data.name,
          // An emptied box means no description, rather than an empty one.
          description: parsed.data.description.length > 0 ? parsed.data.description : null,
        })
        .eq('id', parsed.data.spaceId);

      if (error) return errorState('That space could not be saved.');
      return successState(undefined);
    },
    `/spaces/${String(formData.get('spaceId') ?? '')}`,
  );
}

export async function createTeamSpace(formData: FormData): Promise<ActionState<{ id: string }>> {
  return withSession(async ({ supabase, orgId }) => {
    const parsed = createSpaceSchema.safeParse({
      name: formData.get('name'),
      description: formData.get('description') ?? undefined,
    });
    if (!parsed.success) return errorState(parsed.error.issues[0].message);

    // One statement, because the SELECT policy applies to a RETURNING clause and the
    // creator is not a member yet, so an insert here cannot read back its own row.
    const { data, error } = await supabase.rpc('create_team_space', {
      p_org_id: orgId,
      p_name: parsed.data.name,
      p_description: parsed.data.description ?? undefined,
    });

    if (error) {
      return databaseErrorState('creating a team space', error, {
        fallback: 'That space could not be created.',
      });
    }

    return successState({ id: data });
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
