/** Addresses for the members on one screen, read in one call through org_member_emails. */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

/** How many members one screen shows. */
export const MEMBERS_PER_PAGE = 50;

/** Shown in place of an address for a member whose account no longer carries one. */
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
