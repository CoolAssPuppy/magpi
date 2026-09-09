import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { successState } from '@/lib/actions/state';
import type { LinkCandidate } from '@/lib/dreams/view-model';

import { LinkCandidates } from './link-candidates';

const getCandidate = (overrides?: Partial<LinkCandidate>): LinkCandidate => ({
  id: 'link-1',
  documentA: { id: 'doc-a', title: 'Linear: SSO rollout', url: 'https://linear.app/issue/1' },
  documentB: { id: 'doc-b', title: 'Slack: sso thread', url: null },
  similarityLabel: '92% similar',
  rationale: 'Both describe the SSO rollout slipping to October.',
  state: 'pending',
  ...overrides,
});

const getActions = () => ({
  onConfirm: vi.fn().mockResolvedValue(successState(undefined)),
  onDismiss: vi.fn().mockResolvedValue(successState(undefined)),
});

describe('candidate document links', () => {
  it('names both documents, the score and the reason the run paired them', () => {
    render(<LinkCandidates candidates={[getCandidate()]} {...getActions()} />);

    expect(screen.getByText('Linear: SSO rollout')).toBeInTheDocument();
    expect(screen.getByText('Slack: sso thread')).toBeInTheDocument();
    expect(screen.getByText('92% similar')).toBeInTheDocument();
    expect(
      screen.getByText('Both describe the SSO rollout slipping to October.'),
    ).toBeInTheDocument();
  });

  it('lets a person confirm a pair', async () => {
    const actions = getActions();
    render(<LinkCandidates candidates={[getCandidate()]} {...actions} />);

    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(actions.onConfirm).toHaveBeenCalledWith('link-1');
  });

  it('lets a person dismiss a pair', async () => {
    const actions = getActions();
    render(<LinkCandidates candidates={[getCandidate()]} {...actions} />);

    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(actions.onDismiss).toHaveBeenCalledWith('link-1');
  });

  it('shows a decided pair as decided, with nothing left to press', () => {
    render(<LinkCandidates candidates={[getCandidate({ state: 'confirmed' })]} {...getActions()} />);

    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument();
  });

  it('shows a dismissed pair as dismissed', () => {
    render(<LinkCandidates candidates={[getCandidate({ state: 'dismissed' })]} {...getActions()} />);

    expect(screen.getByText('Dismissed')).toBeInTheDocument();
  });

  it('says the run found no pairs rather than showing an empty box', () => {
    render(<LinkCandidates candidates={[]} {...getActions()} />);

    expect(screen.getByText(/found no pairs/i)).toBeInTheDocument();
  });

  it('shows the pair as decided once the decision is saved', async () => {
    const actions = getActions();
    render(<LinkCandidates candidates={[getCandidate()]} {...actions} />);

    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(await screen.findByText('Confirmed')).toBeInTheDocument();
  });

  it('leaves the pair undecided when the write failed', async () => {
    const actions = getActions();
    actions.onDismiss.mockResolvedValue({ status: 'error', message: 'That link is gone.' });
    render(<LinkCandidates candidates={[getCandidate()]} {...actions} />);

    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
  });

  it('reports a refused decision', async () => {
    const actions = getActions();
    actions.onConfirm.mockResolvedValue({ status: 'error', message: 'That link is gone.' });
    render(<LinkCandidates candidates={[getCandidate()]} {...actions} />);

    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That link is gone.');
  });
});
