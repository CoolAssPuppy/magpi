'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { errorState, successState, type ActionState } from '@/lib/actions/state';
import { withSession } from '@/lib/actions/with-session';

const SETTINGS_PATH = '/settings';

const displayNameSchema = z.object({ displayName: z.string().trim().min(1).max(80) });
const spaceNameSchema = z.object({ name: z.string().trim().min(1).max(120) });

export async function updateDisplayName(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = displayNameSchema.safeParse({ displayName: formData.get('displayName') });
  if (!parsed.success) return errorState('A display name is between 1 and 80 characters.');

  return withSession(async ({ supabase }) => {
    const { error } = await supabase.auth.updateUser({
      data: { display_name: parsed.data.displayName },
    });

    if (error) return errorState('Your display name could not be saved.');
    return successState(undefined);
  }, SETTINGS_PATH);
}

export async function renamePersonalSpace(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = spaceNameSchema.safeParse({ name: formData.get('name') });
  if (!parsed.success) return errorState('A space name is between 1 and 120 characters.');

  return withSession(async ({ supabase, userId, orgId }) => {
    const { error } = await supabase
      .from('spaces')
      .update({ name: parsed.data.name })
      .eq('org_id', orgId)
      .eq('kind', 'personal')
      .eq('owner_user_id', userId);

    if (error) return errorState('That space could not be renamed.');
    return successState(undefined);
  }, SETTINGS_PATH);
}

/**
 * Global scope, so every refresh token this account holds is revoked, not just
 * the one in this browser. That is the whole point of the button.
 */
export async function signOutEverywhere(
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  return withSession(async ({ supabase }) => {
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) return errorState('You could not be signed out. Try again.');

    redirect('/sign-in');
  }, SETTINGS_PATH);
}
