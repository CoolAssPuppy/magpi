import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { idleState, type ActionState } from '@/lib/actions/state';

import { MemberList, type MemberRow } from './member-list';
import { PendingInvites, type InviteRow } from './pending-invites';

const NOW = new Date('2026-09-09T14:20:00.000Z');

const noop = async (): Promise<ActionState> => idleState;

function member(overrides?: Partial<MemberRow>): MemberRow {
  return {
    userId: '22222222-2222-4222-8222-222222222222',
    email: 'ada@example.com',
    role: 'member',
    joinedAt: '2026-09-07T14:20:00.000Z',
    isSelf: false,
    ...overrides,
  };
}

function invite(overrides?: Partial<InviteRow>): InviteRow {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    email: 'grace@example.com',
    role: 'member',
    createdAt: '2026-09-08T14:20:00.000Z',
    expiresAt: '2026-09-15T14:20:00.000Z',
    ...overrides,
  };
}

describe('member list', () => {
  it('shows each member with their role and when they joined', () => {
    render(<MemberList members={[member()]} now={NOW} removeAction={noop} />);

    const row = screen.getByText('ada@example.com').closest('tr') as HTMLElement;
    expect(within(row).getByText('Member')).toBeInTheDocument();
    expect(within(row).getByText('2 days ago')).toBeInTheDocument();
  });

  it('offers no way to remove yourself, which the database would refuse anyway', () => {
    render(<MemberList members={[member({ isSelf: true })]} now={NOW} removeAction={noop} />);

    expect(screen.getByText('That is you')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('offers no way to remove the owner', () => {
    render(<MemberList members={[member({ role: 'owner' })]} now={NOW} removeAction={noop} />);

    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('gives every other member a remove button', () => {
    render(<MemberList members={[member()]} now={NOW} removeAction={noop} />);

    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('shows an empty state rather than an empty table', () => {
    render(<MemberList members={[]} now={NOW} removeAction={noop} />);

    expect(screen.getByText('No members yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('pending invites', () => {
  it('counts down to the expiry so a stale invitation is visible', () => {
    render(<PendingInvites invites={[invite()]} now={NOW} revokeAction={noop} />);

    const row = screen.getByText('grace@example.com').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('in 6 days')).toBeInTheDocument();
  });

  it('says so once an invitation has run out', () => {
    render(
      <PendingInvites
        invites={[invite({ expiresAt: '2026-09-01T14:20:00.000Z' })]}
        now={NOW}
        revokeAction={noop}
      />,
    );

    expect(screen.getByText('Expired')).toBeInTheDocument();
  });

  it('says nothing is waiting rather than drawing an empty table', () => {
    render(<PendingInvites invites={[]} now={NOW} revokeAction={noop} />);

    expect(screen.getByText('No invitations are waiting.')).toBeInTheDocument();
  });
});
