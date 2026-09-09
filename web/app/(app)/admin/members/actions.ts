'use server';

import { createHash, randomBytes } from 'node:crypto';

import { z } from 'zod';

import { withSession } from '@/lib/actions/with-session';
import { errorState, successState, type ActionState } from '@/lib/actions/state';

const MEMBERS_PATH = '/admin/members';

/** A week is long enough to act on and short enough that a leaked link expires. */
const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const inviteSchema = z.object({
  email: z.email(),
  role: z.enum(['admin', 'member']),
});

const idSchema = z.object({ id: z.uuid() });

export type InvitedMember = { readonly email: string; readonly token: string };

/**
 * The token is shown to the admin once and only its hash is stored, so a
 * database read cannot be turned into an accepted invitation.
 */
export async function inviteMember(
  _previous: ActionState<InvitedMember>,
  formData: FormData,
): Promise<ActionState<InvitedMember>> {
  const parsed = inviteSchema.safeParse({
    email: formData.get('email'),
    role: formData.get('role'),
  });

  if (!parsed.success) return errorState('Enter a valid email address and pick a role.');

  return withSession<InvitedMember>(async ({ supabase, userId, orgId }) => {
    const token = randomBytes(32).toString('base64url');

    const { error } = await supabase.from('org_invites').insert({
      org_id: orgId,
      email: parsed.data.email,
      role: parsed.data.role,
      token_hash: createHash('sha256').update(token).digest('hex'),
      invited_by: userId,
      expires_at: new Date(Date.now() + INVITE_LIFETIME_MS).toISOString(),
    });

    if (error) {
      return errorState(
        error.code === '23505'
          ? 'That address already has an invitation waiting.'
          : 'The invitation could not be created.',
      );
    }

    return successState({ email: parsed.data.email, token });
  }, MEMBERS_PATH);
}

export async function removeMember(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = idSchema.safeParse({ id: formData.get('userId') });
  if (!parsed.success) return errorState('That member could not be identified.');

  return withSession(async ({ supabase, orgId }) => {
    const { error } = await supabase
      .from('org_members')
      .delete()
      .eq('org_id', orgId)
      .eq('user_id', parsed.data.id);

    if (error) return errorState('That member could not be removed.');
    return successState(undefined);
  }, MEMBERS_PATH);
}

export async function revokeInvite(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = idSchema.safeParse({ id: formData.get('inviteId') });
  if (!parsed.success) return errorState('That invitation could not be identified.');

  return withSession(async ({ supabase, orgId }) => {
    const { error } = await supabase
      .from('org_invites')
      .delete()
      .eq('org_id', orgId)
      .eq('id', parsed.data.id);

    if (error) return errorState('That invitation could not be revoked.');
    return successState(undefined);
  }, MEMBERS_PATH);
}
