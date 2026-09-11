'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { errorState, successState, type ActionState } from '@/lib/actions/state';
import { withSession } from '@/lib/actions/with-session';

const SETTINGS_PATH = '/settings';

const displayNameSchema = z.object({ displayName: z.string().trim().min(1).max(80) });

// Parsing happens inside withSession, so a signed-out caller is told to sign in.

export async function updateDisplayName(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withSession(async ({ supabase }) => {
    const parsed = displayNameSchema.safeParse({ displayName: formData.get('displayName') });
    if (!parsed.success) return errorState('A display name is between 1 and 80 characters.');

    const { error } = await supabase.auth.updateUser({
      data: { display_name: parsed.data.displayName },
    });

    if (error) return errorState('Your display name could not be saved.');
    return successState(undefined);
  }, SETTINGS_PATH);
}

/** Signs out with global scope, revoking every refresh token this account holds. */
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
