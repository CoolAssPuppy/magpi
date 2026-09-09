'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { errorState, successState, type ActionState } from '@/lib/actions/state';
import { withSession } from '@/lib/actions/with-session';
import {
  beginConnection,
  claimConnection,
  requestFullSync,
  requestScopes,
} from '@/lib/connections/edge';
import type { ScopeSelection } from '@/lib/connections/scope-selection';

const CONNECTIONS_PATH = '/connections';

const slugSchema = z.string().min(1).max(64);
const idSchema = z.uuid();

export async function startConnection(
  providerSlug: string,
  spaceId: string,
): Promise<ActionState<undefined>> {
  const input = z.object({ providerSlug: slugSchema, spaceId: idSchema }).safeParse({
    providerSlug,
    spaceId,
  });
  if (!input.success) return errorState('Choose a source and a space.');

  let authorizeUrl: string | null = null;

  const state = await withSession(async (context) => {
    // RLS is the space check: a space the caller cannot select is not one they
    // can bind a connection to.
    const { data: space } = await context.supabase
      .from('spaces')
      .select('id')
      .eq('id', input.data.spaceId)
      .maybeSingle();
    if (!space) return errorState('You are not in that space.');

    const result = await beginConnection(context.supabase, {
      provider: input.data.providerSlug,
      spaceId: input.data.spaceId,
      returnTo: `${CONNECTIONS_PATH}/${input.data.providerSlug}`,
    });
    if (!result.ok) return errorState(result.error);

    authorizeUrl = result.data.authorizeUrl;
    return successState(undefined);
  }, CONNECTIONS_PATH);

  if (state.status === 'success' && authorizeUrl) redirect(authorizeUrl);
  return state;
}

/**
 * Commits a token that the callback parked, under the caller's own verified
 * session. Without this step the person who finishes the flow decides whose
 * account the token lands on.
 */
export async function claimPendingConnection(ticket: string): Promise<ActionState<undefined>> {
  const input = z.string().min(1).max(256).safeParse(ticket);
  if (!input.success) return errorState('That connection ticket is not valid.');

  return withSession(async (context) => {
    const result = await claimConnection(context.supabase, { ticket: input.data });
    return result.ok ? successState(undefined) : errorState(result.error);
  }, CONNECTIONS_PATH);
}

/**
 * Saves what a connection reads, and answers with the selection as it now
 * stands. connections-scopes drops an id the provider no longer offers, so the
 * answer is what the screen renders: a tick that was quietly dropped would
 * otherwise read as saved.
 */
export async function saveScopeSelection(
  connectionId: string,
  selected: readonly string[],
): Promise<ActionState<ScopeSelection>> {
  const input = z
    .object({ connectionId: idSchema, selected: z.array(z.string().min(1).max(256)).max(500) })
    .safeParse({ connectionId, selected });
  if (!input.success) return errorState('That selection could not be saved.');

  return withSession(async (context) => {
    const result = await requestScopes(context.supabase, {
      connectionId: input.data.connectionId,
      selected: input.data.selected,
    });
    return result.ok ? successState(result.data) : errorState(result.error);
  }, CONNECTIONS_PATH);
}

export async function disconnectConnection(connectionId: string): Promise<ActionState<undefined>> {
  const input = idSchema.safeParse(connectionId);
  if (!input.success) return errorState('That is not a connection.');

  return withSession(async (context) => {
    const { error } = await context.supabase.from('connections').delete().eq('id', input.data);
    if (error) return errorState('That connection could not be disconnected.');
    return successState(undefined);
  }, CONNECTIONS_PATH);
}

/**
 * A full re-sync re-reads a source from the beginning. It is its own action and
 * never a side effect of saving a scope or of opening a page.
 */
export async function resyncConnection(connectionId: string): Promise<ActionState<undefined>> {
  const input = idSchema.safeParse(connectionId);
  if (!input.success) return errorState('That is not a connection.');

  return withSession(async (context) => {
    const result = await requestFullSync(context.supabase, { connectionId: input.data });
    return result.ok ? successState(undefined) : errorState(result.error);
  }, CONNECTIONS_PATH);
}
