'use server';

import { z } from 'zod';

import { databaseErrorState } from '@/lib/actions/database-error';
import { errorState, successState, type ActionState } from '@/lib/actions/state';
import { withSession } from '@/lib/actions/with-session';

const CHAT_PATH = '/chat';

const createSchema = z.object({
  spaceFilter: z.array(z.uuid()).nullable(),
});

const renameSchema = z.object({
  conversationId: z.uuid(),
  title: z.string().trim().min(1).max(120),
});

const conversationSchema = z.object({ conversationId: z.uuid() });

const INVALID = 'That is not something we can do with a conversation.';

// Parsing happens inside withSession in every action file, so a signed-out
// caller is told to sign in whatever they sent.

export async function createConversationAction(
  input: z.input<typeof createSchema>,
): Promise<ActionState<string>> {
  return withSession(async ({ supabase, userId, orgId }) => {
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return errorState(INVALID);

    const { data, error } = await supabase
      .from('conversations')
      .insert({
        org_id: orgId,
        user_id: userId,
        space_filter: parsed.data.spaceFilter,
      })
      .select('id')
      .single();

    if (error) {
      return databaseErrorState('creating a conversation', error, {
        fallback: 'That conversation could not be started.',
      });
    }
    return successState(data.id);
  }, CHAT_PATH);
}

export async function renameConversationAction(
  input: z.input<typeof renameSchema>,
): Promise<ActionState<string>> {
  return withSession(async ({ supabase }) => {
    const parsed = renameSchema.safeParse(input);
    if (!parsed.success) return errorState(INVALID);

    const { error } = await supabase
      .from('conversations')
      .update({ title: parsed.data.title })
      .eq('id', parsed.data.conversationId);

    if (error) {
      return databaseErrorState('renaming a conversation', error, {
        fallback: 'That conversation could not be renamed.',
      });
    }
    return successState(parsed.data.title);
  }, CHAT_PATH);
}

export async function deleteConversationAction(
  input: z.input<typeof conversationSchema>,
): Promise<ActionState<string>> {
  return withSession(async ({ supabase }) => {
    const parsed = conversationSchema.safeParse(input);
    if (!parsed.success) return errorState(INVALID);

    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', parsed.data.conversationId);

    if (error) {
      return databaseErrorState('deleting a conversation', error, {
        fallback: 'That conversation could not be deleted.',
      });
    }
    return successState(parsed.data.conversationId);
  }, CHAT_PATH);
}
