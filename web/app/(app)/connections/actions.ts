'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { errorState, successState, type ActionState } from '@/lib/actions/state';
import { withSession } from '@/lib/actions/with-session';
import { beginConnection, claimConnection, requestFullSync } from '@/lib/connections/edge';
import {
  applySelection,
  parseScopeSelection,
  serializeScopeSelection,
} from '@/lib/connections/scope-selection';
import { createServiceClient } from '@/lib/supabase/service';

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
  if (!input.success) return errorState('That is not a source and a space Recall can connect.');

  let authorizeUrl: string | null = null;

  const state = await withSession(async (context) => {
    // RLS is the space check: a space the caller cannot select is not one they
    // can bind a connection to.
    const { data: space } = await context.supabase
      .from('spaces')
      .select('id')
      .eq('id', input.data.spaceId)
      .maybeSingle();
    if (!space) return errorState('That space is not one you can connect a source to.');

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

export async function saveScopeSelection(
  connectionId: string,
  selected: readonly string[],
): Promise<ActionState<undefined>> {
  const input = z
    .object({ connectionId: idSchema, selected: z.array(z.string().min(1).max(256)).max(500) })
    .safeParse({ connectionId, selected });
  if (!input.success) return errorState('That selection is not one this app can save.');

  return withSession(async (context) => {
    const { data: connection } = await context.supabase
      .from('connections')
      .select('id, user_id, scope_selection')
      .eq('id', input.data.connectionId)
      .maybeSingle();
    if (!connection) return errorState('That connection is not one you can change.');
    if (connection.user_id !== context.userId) {
      return errorState('Only the person who connected this source can change what it reads.');
    }

    const parsed = parseScopeSelection(connection.scope_selection);
    if (!parsed.ok) return errorState('This connection recorded a scope this app cannot read.');
    if (parsed.data.kind === 'unset') {
      return errorState('This connection has not listed what it can read yet.');
    }

    const applied = applySelection(parsed.data, input.data.selected);
    if (!applied.ok) return errorState(applied.error);

    // connections has no update policy: every write to it is a service-role
    // write. The ownership check above is what stands in for the policy, and it
    // runs before the elevated client is constructed.
    const { error } = await createServiceClient()
      .from('connections')
      .update({ scope_selection: serializeScopeSelection(parsed.data, applied.data) })
      .eq('id', input.data.connectionId);
    if (error) return errorState('The selection could not be saved.');

    return successState(undefined);
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
