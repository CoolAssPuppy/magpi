import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BoundaryError } from './error-boundary';

const user = userEvent.setup({ delay: null });

const getError = (overrides: Partial<Error & { digest?: string }> = {}) =>
  Object.assign(new Error('permission denied for table documents'), {
    digest: '2094817364',
    ...overrides,
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('what a screen shows when it fails', () => {
  it('says what failed and what it means for the person reading it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <BoundaryError
        title="Documents did not load"
        detail="Nothing was deleted."
        error={getError()}
        reset={() => {}}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Documents did not load');
    expect(screen.getByRole('alert')).toHaveTextContent('Nothing was deleted.');
  });

  // In production Next replaces the message with generic digest text, so a
  // sentence built around it reads as nonsense on the screen that matters.
  it('keeps the thrown message off the screen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <BoundaryError
        title="Documents did not load"
        detail="Nothing was deleted."
        error={getError()}
        reset={() => {}}
      />,
    );

    expect(screen.queryByText(/permission denied/i)).not.toBeInTheDocument();
  });

  it('offers a way back rather than a dead end', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reset = vi.fn();
    render(
      <BoundaryError
        title="Documents did not load"
        detail="Nothing was deleted."
        error={getError()}
        reset={reset}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  // The digest is the only handle on which failure this was once the message
  // has been replaced, so it has to reach the logs even though it is useless
  // on screen.
  it('logs the digest, which is the only way back to the real failure', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <BoundaryError
        title="Documents did not load"
        detail="Nothing was deleted."
        error={getError()}
        reset={() => {}}
      />,
    );

    expect(logged).toHaveBeenCalledWith('Documents did not load', '2094817364');
  });

  it('logs the message when there is no digest to log', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <BoundaryError
        title="Documents did not load"
        detail="Nothing was deleted."
        error={getError({ digest: undefined })}
        reset={() => {}}
      />,
    );

    expect(logged).toHaveBeenCalledWith(
      'Documents did not load',
      'permission denied for table documents',
    );
  });
});
