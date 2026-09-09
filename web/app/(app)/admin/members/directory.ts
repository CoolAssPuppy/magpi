/**
 * Addresses for the members on one screen.
 *
 * org_members holds a user id and nothing else. Addresses live in auth.users,
 * which no policy exposes, and GoTrue has no "give me these ids" call: the
 * choice is one request per member or a walk through the directory. A walk is
 * what this does, because the spec's organization holds four thousand people
 * and four thousand requests is not a page load.
 *
 * The walk is still a walk. Putting the address on org_members, or a security
 * definer function that returns id and address for one organization, would make
 * this a single query. Both are schema changes.
 */

/** GoTrue's largest page. Fewer, larger requests is the whole point here. */
export const DIRECTORY_PAGE_SIZE = 1000;

/**
 * How far the walk goes before it gives up. A directory larger than this leaves
 * some rows without an address rather than holding a render open for as many
 * requests as the project has accounts.
 */
const MAX_DIRECTORY_PAGES = 20;

/** How many members one screen shows. */
export const MEMBERS_PER_PAGE = 50;

export type DirectoryUser = {
  readonly id: string;
  readonly email?: string;
};

export type DirectoryResult =
  | {
      readonly data: { readonly users: readonly DirectoryUser[]; readonly nextPage: number | null };
      readonly error: null;
    }
  | {
      readonly data: { readonly users: readonly DirectoryUser[] };
      readonly error: { readonly message: string };
    };

/** The slice of the GoTrue admin API this file uses, and all a test has to stand up. */
export type UserDirectory = {
  readonly listUsers: (params: { page: number; perPage: number }) => Promise<DirectoryResult>;
};

export async function resolveEmails(
  directory: UserDirectory,
  userIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const wanted = new Set(userIds);
  const emails = new Map<string, string>();
  if (wanted.size === 0) return emails;

  for (let page = 1; page <= MAX_DIRECTORY_PAGES; page += 1) {
    const result = await directory.listUsers({ page, perPage: DIRECTORY_PAGE_SIZE });
    if (result.error) throw new Error(result.error.message);

    for (const user of result.data.users) {
      if (!wanted.has(user.id) || !user.email) continue;
      emails.set(user.id, user.email);
    }

    if (emails.size === wanted.size) break;
    if (result.data.nextPage === null) break;
  }

  return emails;
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
