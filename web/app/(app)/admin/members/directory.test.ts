import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { Database } from '@/lib/database.types';

import {
  MEMBERS_PER_PAGE,
  memberPageCount,
  memberPageRange,
  parseMemberPage,
  resolveEmails,
} from './directory';

const ADA = '11111111-1111-4111-8111-111111111111';
const GRACE = '22222222-2222-4222-8222-222222222222';

type RpcCall = { name: string; args: unknown };

/** Stands in for the one rpc this module makes, counting how many a render sends. */
function clientReturning(
  rows: readonly { user_id: string; email: string }[],
  error: { message: string } | null = null,
): { supabase: SupabaseClient<Database>; calls: RpcCall[] } {
  const calls: RpcCall[] = [];

  const supabase = {
    rpc: (name: string, args: unknown) => {
      calls.push({ name, args });
      return Promise.resolve({ data: error ? null : rows, error });
    },
  } as unknown as SupabaseClient<Database>;

  return { supabase, calls };
}

describe('resolving the addresses on a member page', () => {
  it('asks one question, whatever the organization holds', async () => {
    const { supabase, calls } = clientReturning([
      { user_id: ADA, email: 'ada@example.com' },
      { user_id: GRACE, email: 'grace@example.com' },
    ]);

    const emails = await resolveEmails(supabase, 'org-1');

    expect(emails.get(ADA)).toBe('ada@example.com');
    expect(emails.get(GRACE)).toBe('grace@example.com');
    expect(calls).toEqual([{ name: 'org_member_emails', args: { p_org_id: 'org-1' } }]);
  });

  // A caller who is not an admin gets nothing back, which is a boundary rather than an error.
  it('answers with nothing rather than failing when the caller may not read them', async () => {
    const { supabase } = clientReturning([]);

    expect(await resolveEmails(supabase, 'org-1')).toEqual(new Map());
  });

  it('raises what the database said rather than a page of unknown addresses', async () => {
    const { supabase } = clientReturning([], { message: 'permission denied' });

    await expect(resolveEmails(supabase, 'org-1')).rejects.toThrow('permission denied');
  });
});

describe('which members one screen shows', () => {
  it('asks the database for one page of members, not the whole organization', () => {
    expect(memberPageRange(1)).toEqual({ from: 0, to: MEMBERS_PER_PAGE - 1 });
    expect(memberPageRange(3)).toEqual({
      from: MEMBERS_PER_PAGE * 2,
      to: MEMBERS_PER_PAGE * 3 - 1,
    });
  });

  it('counts the pages an organization fills, and always offers one', () => {
    expect(memberPageCount(0)).toBe(1);
    expect(memberPageCount(MEMBERS_PER_PAGE)).toBe(1);
    expect(memberPageCount(MEMBERS_PER_PAGE + 1)).toBe(2);
    expect(memberPageCount(4000)).toBe(Math.ceil(4000 / MEMBERS_PER_PAGE));
  });

  it('reads the page a link asked for', () => {
    expect(parseMemberPage('2')).toBe(2);
  });

  it('starts at the first page for a link that says nothing, or says nonsense', () => {
    expect(parseMemberPage(undefined)).toBe(1);
    expect(parseMemberPage('0')).toBe(1);
    expect(parseMemberPage('-3')).toBe(1);
    expect(parseMemberPage('2.5')).toBe(1);
    expect(parseMemberPage('last')).toBe(1);
  });
});
