import { headers } from 'next/headers';
import Link from 'next/link';

import { InviteForm } from '@/components/admin/invite-form';
import { MemberList, type MemberRow } from '@/components/admin/member-list';
import { Panel } from '@/components/admin/panel';
import { PendingInvites, type InviteRow } from '@/components/admin/pending-invites';
import { ErrorState } from '@/components/app/error-state';
import { resolveAdminAccess } from '@/lib/analytics/access';

import { inviteMember, removeMember, revokeInvite } from './actions';
import { memberPageCount, memberPageRange, parseMemberPage, resolveEmails } from './directory';

async function siteOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get('host') ?? 'localhost:3000';
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http';
  return `${protocol}://${host}`;
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const [access, query] = await Promise.all([resolveAdminAccess(), searchParams]);
  if (access.kind !== 'granted') return null;

  const { context, elevated } = access;
  const now = new Date();
  const page = parseMemberPage(query.page);
  const { from, to } = memberPageRange(page);

  const [memberships, invites, baseUrl] = await Promise.all([
    context.supabase
      .from('org_members')
      .select('user_id, role, created_at', { count: 'exact' })
      .eq('org_id', context.orgId)
      // Owners first, then admins. Within a rank, whoever joined first. The
      // ranking is org_role's own declaration order, which is how a Postgres
      // enum sorts, and it has to happen here rather than in this process: a
      // page of members sorted after the fact is a page of arbitrary members.
      .order('role', { ascending: true })
      .order('created_at', { ascending: true })
      .range(from, to),
    context.supabase
      .from('org_invites')
      .select('id, email, role, created_at, expires_at')
      .eq('org_id', context.orgId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false }),
    siteOrigin(),
  ]);

  if (memberships.error) {
    return (
      <ErrorState
        title="The member list did not load"
        detail="This reads org_members through your own session. If it keeps failing, your role may have changed."
      />
    );
  }

  // Addresses live in auth.users, which no policy exposes, so they are resolved
  // with the service client after the database has already confirmed this caller
  // is an admin of this organization.
  const emails = await resolveEmails(
    elevated.auth.admin,
    memberships.data.map((membership) => membership.user_id),
  );

  const members: readonly MemberRow[] = memberships.data.map((membership) => ({
    userId: membership.user_id,
    email: emails.get(membership.user_id) ?? 'Unknown address',
    role: membership.role,
    joinedAt: membership.created_at,
    isSelf: membership.user_id === context.userId,
  }));

  const total = memberships.count ?? members.length;
  const pageCount = memberPageCount(total);

  const pending: readonly InviteRow[] = (invites.data ?? []).map((invite) => ({
    id: invite.id,
    email: invite.email,
    role: invite.role,
    createdAt: invite.created_at,
    expiresAt: invite.expires_at,
  }));

  return (
    <div className="flex flex-col gap-8">
      <Panel
        title="Invite someone"
        description="An invitation is a one-time link. Magpi stores a hash of it, so it can only be read once."
      >
        <InviteForm action={inviteMember} baseUrl={baseUrl} />
      </Panel>

      <Panel title="Members" description={`${total} in this organization.`}>
        <MemberList members={members} now={now} removeAction={removeMember} />
        <MemberPager page={page} pageCount={pageCount} />
      </Panel>

      <Panel title="Waiting to accept">
        <PendingInvites invites={pending} now={now} revokeAction={revokeInvite} />
      </Panel>
    </div>
  );
}

function MemberPager({ page, pageCount }: { page: number; pageCount: number }) {
  if (pageCount <= 1) return null;

  return (
    <nav
      aria-label="Member pages"
      className="mt-4 flex items-center justify-between text-sm text-foreground-lighter"
    >
      <PagerLink href={`/admin/members?page=${page - 1}`} enabled={page > 1}>
        Previous
      </PagerLink>
      <span>{`Page ${page} of ${pageCount}`}</span>
      <PagerLink href={`/admin/members?page=${page + 1}`} enabled={page < pageCount}>
        Next
      </PagerLink>
    </nav>
  );
}

function PagerLink({
  href,
  enabled,
  children,
}: {
  href: string;
  enabled: boolean;
  children: string;
}) {
  if (!enabled) return <span className="text-foreground-muted">{children}</span>;

  return (
    <Link href={href} className="text-foreground hover:underline">
      {children}
    </Link>
  );
}
