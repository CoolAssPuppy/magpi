/**
 * Addresses for the members on one screen.
 *
 * org_members holds a user id and nothing else, and addresses live in auth.users
 * where no policy exposes them. The page used to call auth.admin.getUserById
 * once per member, and the spec's organization holds four thousand people.
 *
 * `org_member_emails` is one query. It is security definer, and it tests
 * is_org_admin itself rather than trusting this caller, because a function that
 * reads auth.users with no check of its own is a directory of every account in
 * the project behind one rpc call.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

/** How many members one screen shows. */
export const MEMBERS_PER_PAGE = 50;

/**
 * A member whose account no longer carries an address reads as unknown rather
 * than as a missing row. The membership is the thing the page is listing.
 */
export const UNKNOWN_ADDRESS = 'Unknown address';

export async function resolveEmails(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<ReadonlyMap<string, string>> {
  const { data, error } = await supabase.rpc('org_member_emails', { p_org_id: orgId });
  if (error) throw new Error(error.message);

  return new Map((data ?? []).map((row) => [row.user_id, row.email]));
}

export function memberPageRange(page: number): { readonly from: number; readonly to: number } {
  const from = (page - 1) * MEMBERS_PER_PAGE;
  return { from, to: from + MEMBERS_PER_PAGE - 1 };
}

export function memberPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / MEMBERS_PER_PAGE));
}

/** A page number a reader typed into the address bar is not a number yet. */
export function parseMemberPage(value: string | undefined): number {
  if (value === undefined) return 1;

  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}
