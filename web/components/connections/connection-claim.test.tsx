import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { successState } from '@/lib/actions/state';

import { ConnectionClaim } from './connection-claim';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/connections/slack',
}));

describe('finishing a connection after the provider sends the browser back', () => {
  it('commits the ticket under this session, once', async () => {
    const onClaim = vi.fn().mockResolvedValue(successState(undefined));
    render(<ConnectionClaim ticket="ticket-abc" onClaim={onClaim} />);

    await waitFor(() => expect(onClaim).toHaveBeenCalledWith('ticket-abc'));
    expect(onClaim).toHaveBeenCalledTimes(1);
  });

  it('takes the ticket out of the address bar once it is spent', async () => {
    const onClaim = vi.fn().mockResolvedValue(successState(undefined));
    render(<ConnectionClaim ticket="ticket-abc" onClaim={onClaim} />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/connections/slack'));
  });

  it('says why a claim failed rather than leaving the screen looking connected', async () => {
    const onClaim = vi.fn().mockResolvedValue({ status: 'error', message: 'That ticket expired.' });
    render(<ConnectionClaim ticket="ticket-abc" onClaim={onClaim} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('That ticket expired.');
  });
});
