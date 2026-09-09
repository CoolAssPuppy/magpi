import { headers } from 'next/headers';

import { InviteForm } from '@/components/admin/invite-form';
import { MemberList, type MemberRow } from '@/components/admin/member-list';
import { Panel } from '@/components/admin/panel';
import { PendingInvites, type InviteRow } from '@/components/admin/pending-invites';
import { ErrorState } from '@/components/app/error-state';
import { resolveAdminAccess } from '@/lib/analytics/access';
import type { Database } from '@/lib/database.types';

import { inviteMember, removeMember, revokeInvite } from './actions';

type OrgRole = Database['public']['Enums']['org_role'];

/** Owners first, then admins. Within a rank, whoever joined first. */
const ROLE_RANK: Record<OrgRole, number> = { owner: 0, admin: 1, member: 2 };

async function siteOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get('host') ?? 'localhost:3000';
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http';
  return `${protocol}://${host}`;
}

export default async function MembersPage() {
  const access = await resolveAdminAccess();
  if (access.kind !== 'granted') return null;

  const { context, elevated } = access;
  const now = new Date();

  const [memberships, invites, baseUrl] = await Promise.all([
    context.supabase
      .from('org_members')
      .select('user_id, role, created_at')
      .eq('org_id', context.orgId),
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

  // org_members holds only a user id. Addresses live in auth.users, which no
  // policy exposes, so they are resolved with the service client after the
  // database has already confirmed this caller is an admin of this organization.
  const members: readonly MemberRow[] = await Promise.all(
    memberships.data.map(async (membership): Promise<MemberRow> => {
      const { data } = await elevated.auth.admin.getUserById(membership.user_id);
      return {
        userId: membership.user_id,
        email: data.user?.email ?? 'Unknown address',
        role: membership.role,
        joinedAt: membership.created_at,
        isSelf: membership.user_id === context.userId,
      };
    }),
  );

  const sorted = [...members].sort(
    (a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.joinedAt.localeCompare(b.joinedAt),
  );

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

      <Panel title="Members" description={`${sorted.length} in this organization.`}>
        <MemberList members={sorted} now={now} removeAction={removeMember} />
      </Panel>

      <Panel title="Waiting to accept">
        <PendingInvites invites={pending} now={now} revokeAction={revokeInvite} />
      </Panel>
    </div>
  );
}
