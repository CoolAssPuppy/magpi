'use server';

import { z } from 'zod';

import { databaseErrorState } from '@/lib/actions/database-error';
import { errorState, successState, type ActionState } from '@/lib/actions/state';
import { withSession } from '@/lib/actions/with-session';
import { FOLDER_COLOR_ORDER } from '@/lib/chat/folder-colors';

const CHAT_PATH = '/chat';

const createSchema = z.object({
  spaceFilter: z.array(z.uuid()).nullable(),
});

const renameSchema = z.object({
  conversationId: z.uuid(),
  title: z.string().trim().min(1).max(120),
});

const conversationSchema = z.object({ conversationId: z.uuid() });

const INVALID = 'That conversation could not be changed.';

// Parsing happens inside withSession, so a signed-out caller is told to sign in whatever they sent.

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

const folderSchema = z.object({ folderId: z.uuid() });

const createFolderSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.enum(FOLDER_COLOR_ORDER),
});

const renameFolderSchema = createFolderSchema.extend({ folderId: z.uuid() });

// Null files a conversation at the top level, which is a destination and not a missing value.
const moveSchema = z.object({
  conversationId: z.uuid(),
  folderId: z.uuid().nullable(),
});

const INVALID_FOLDER = 'That folder could not be changed.';
const DUPLICATE_FOLDER = 'You already have a folder with that name.';

/** A unique violation on the name index is a person retyping a name, not a fault. */
const NAME_TAKEN = '23505';

export async function createFolderAction(
  input: z.input<typeof createFolderSchema>,
): Promise<ActionState<string>> {
  return withSession(async ({ supabase, userId, orgId }) => {
    const parsed = createFolderSchema.safeParse(input);
    if (!parsed.success) return errorState(INVALID_FOLDER);

    const { data, error } = await supabase
      .from('conversation_folders')
      .insert({
        org_id: orgId,
        user_id: userId,
        name: parsed.data.name,
        color: parsed.data.color,
      })
      .select('id')
      .single();

    if (error?.code === NAME_TAKEN) return errorState(DUPLICATE_FOLDER);
    if (error) {
      return databaseErrorState('creating a folder', error, {
        fallback: 'That folder could not be created.',
      });
    }
    return successState(data.id);
  }, CHAT_PATH);
}

export async function renameFolderAction(
  input: z.input<typeof renameFolderSchema>,
): Promise<ActionState<string>> {
  return withSession(async ({ supabase }) => {
    const parsed = renameFolderSchema.safeParse(input);
    if (!parsed.success) return errorState(INVALID_FOLDER);

    const { error } = await supabase
      .from('conversation_folders')
      .update({ name: parsed.data.name, color: parsed.data.color })
      .eq('id', parsed.data.folderId);

    if (error?.code === NAME_TAKEN) return errorState(DUPLICATE_FOLDER);
    if (error) {
      return databaseErrorState('renaming a folder', error, {
        fallback: 'That folder could not be renamed.',
      });
    }
    return successState(parsed.data.name);
  }, CHAT_PATH);
}

/** Deleting a folder keeps its conversations. The column is on delete set null. */
export async function deleteFolderAction(
  input: z.input<typeof folderSchema>,
): Promise<ActionState<string>> {
  return withSession(async ({ supabase }) => {
    const parsed = folderSchema.safeParse(input);
    if (!parsed.success) return errorState(INVALID_FOLDER);

    const { error } = await supabase
      .from('conversation_folders')
      .delete()
      .eq('id', parsed.data.folderId);

    if (error) {
      return databaseErrorState('deleting a folder', error, {
        fallback: 'That folder could not be deleted.',
      });
    }
    return successState(parsed.data.folderId);
  }, CHAT_PATH);
}

export async function moveConversationAction(
  input: z.input<typeof moveSchema>,
): Promise<ActionState<string | null>> {
  return withSession(async ({ supabase }) => {
    const parsed = moveSchema.safeParse(input);
    if (!parsed.success) return errorState(INVALID);

    const { error } = await supabase
      .from('conversations')
      .update({ folder_id: parsed.data.folderId })
      .eq('id', parsed.data.conversationId);

    if (error) {
      return databaseErrorState('moving a conversation', error, {
        fallback: 'That conversation could not be moved.',
      });
    }
    return successState(parsed.data.folderId);
  }, CHAT_PATH);
}
