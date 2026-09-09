import { describe, expect, it } from 'vitest';

import {
  DIRECTORY_PAGE_SIZE,
  MEMBERS_PER_PAGE,
  memberPageCount,
  memberPageRange,
  parseMemberPage,
  resolveEmails,
  type UserDirectory,
} from './directory';

const ADA = '11111111-1111-4111-8111-111111111111';
const GRACE = '22222222-2222-4222-8222-222222222222';
const ALAN = '33333333-3333-4333-8333-333333333333';

type StubPage = {
  readonly users: readonly { readonly id: string; readonly email?: string }[];
  readonly nextPage: number | null;
};

/**
 * Stands in for the GoTrue admin API. It records the page numbers it was asked
 * for, because how many requests one render makes is the whole point of this
 * module: the version it replaced made one per member.
 */
function directoryOf(
  pages: readonly StubPage[],
  error: { message: string } | null = null,
): { directory: UserDirectory; asked: number[] } {
  const asked: number[] = [];

  const directory: UserDirectory = {
    listUsers: async ({ page }) => {
      asked.push(page);
      if (error) return { data: { users: [] }, error };
      return { data: pages[page - 1] ?? { users: [], nextPage: null }, error: null };
    },
  };

  return { directory, asked };
}

describe('resolving the addresses on one page of members', () => {
  it('asks the auth server nothing when the page holds nobody', async () => {
    const { directory, asked } = directoryOf([{ users: [{ id: ADA }], nextPage: null }]);

    expect(await resolveEmails(directory, [])).toEqual(new Map());
    expect(asked).toEqual([]);
  });

  it('reads the directory in pages rather than once per member', async () => {
    const { directory, asked } = directoryOf([
      {
        users: [
          { id: ADA, email: 'ada@example.com' },
          { id: GRACE, email: 'grace@example.com' },
        ],
        nextPage: null,
      },
    ]);

    const emails = await resolveEmails(directory, [ADA, GRACE]);

    expect(emails.get(ADA)).toBe('ada@example.com');
    expect(emails.get(GRACE)).toBe('grace@example.com');
    expect(asked).toEqual([1]);
  });

  it('keeps paging until it has every address the page asked about', async () => {
    const { directory, asked } = directoryOf([
      { users: [{ id: ADA, email: 'ada@example.com' }], nextPage: 2 },
      { users: [{ id: ALAN, email: 'alan@example.com' }], nextPage: null },
    ]);

    const emails = await resolveEmails(directory, [ADA, ALAN]);

    expect(emails.get(ALAN)).toBe('alan@example.com');
    expect(asked).toEqual([1, 2]);
  });

  it('stops as soon as it has them all, rather than walking the whole directory', async () => {
    const { directory, asked } = directoryOf([
      { users: [{ id: ADA, email: 'ada@example.com' }], nextPage: 2 },
      { users: [{ id: ALAN, email: 'alan@example.com' }], nextPage: null },
    ]);

    await resolveEmails(directory, [ADA]);

    expect(asked).toEqual([1]);
  });

  it('leaves out a member whose account is gone, so the screen can say so itself', async () => {
    const { directory } = directoryOf([
      { users: [{ id: ADA, email: 'ada@example.com' }], nextPage: null },
    ]);

    const emails = await resolveEmails(directory, [ADA, GRACE]);

    expect(emails.has(GRACE)).toBe(false);
  });

  it('leaves out an account the auth server holds no address for', async () => {
    const { directory } = directoryOf([{ users: [{ id: ADA }], nextPage: null }]);

    expect((await resolveEmails(directory, [ADA])).has(ADA)).toBe(false);
  });

  it('raises what the auth server said rather than a list of unknown addresses', async () => {
    const { directory } = directoryOf([], { message: 'not authorized' });

    await expect(resolveEmails(directory, [ADA])).rejects.toThrow('not authorized');
  });

  it('gives up after a bounded walk, so one render cannot hang on a huge directory', async () => {
    const endless: StubPage[] = Array.from({ length: 200 }, () => ({
      users: [],
      nextPage: 2,
    }));
    const { directory, asked } = directoryOf(endless);

    const emails = await resolveEmails(directory, [ADA]);

    expect(emails.size).toBe(0);
    expect(asked.length).toBeLessThanOrEqual(20);
  });

  it('reads the directory a thousand accounts at a time, which is what GoTrue allows', () => {
    expect(DIRECTORY_PAGE_SIZE).toBe(1000);
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
