import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCurrentUserImage } from './use-current-user-image';
import { useCurrentUserName } from './use-current-user-name';

type UserMetadata = { avatar_url?: string; full_name?: string };

type Session = {
  readonly user: { readonly email: string | null; readonly user_metadata: UserMetadata };
} | null;

const auth = {
  session: null as Session,
  /** Set to hold getSession open, so a screen can be torn down mid-answer. */
  gate: null as Promise<void> | null,
};

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => {
        if (auth.gate) await auth.gate;
        return { data: { session: auth.session } };
      },
    },
  }),
}));

const getSession = (metadata: UserMetadata, email: string | null = 'ada@example.com'): Session => ({
  user: { email, user_metadata: metadata },
});

function NameProbe() {
  return <span data-testid="value">{useCurrentUserName() ?? 'nothing'}</span>;
}

function ImageProbe() {
  return <span data-testid="value">{useCurrentUserImage() ?? 'nothing'}</span>;
}

const value = () => screen.getByTestId('value').textContent;

beforeEach(() => {
  auth.session = null;
  auth.gate = null;
});

describe('the name of the signed-in person', () => {
  it('uses the name the identity provider gave', async () => {
    auth.session = getSession({ full_name: 'Ada Lovelace' });
    render(<NameProbe />);

    await waitFor(() => expect(value()).toBe('Ada Lovelace'));
  });

  // Email and password signup carries no full name, and an email address is a
  // better answer than a blank space where a person's name goes.
  it('falls back to the email address when no name was given', async () => {
    auth.session = getSession({});
    render(<NameProbe />);

    await waitFor(() => expect(value()).toBe('ada@example.com'));
  });

  it('has nothing to show when nobody is signed in', async () => {
    render(<NameProbe />);

    await waitFor(() => expect(value()).toBe('nothing'));
  });

  it('has nothing to show for a session with neither a name nor an email', async () => {
    auth.session = getSession({}, null);
    render(<NameProbe />);

    await waitFor(() => expect(value()).toBe('nothing'));
  });

  // Setting state on a screen that has gone away is a React warning and a leak,
  // and signing out while this is in flight is the ordinary way to get there.
  it('says nothing once the screen it was for has gone', async () => {
    let release = () => {};
    auth.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    auth.session = getSession({ full_name: 'Ada Lovelace' });
    const warned = vi.spyOn(console, 'error').mockImplementation(() => {});

    const view = render(<NameProbe />);
    view.unmount();
    release();
    await auth.gate;

    expect(warned).not.toHaveBeenCalled();
    warned.mockRestore();
  });
});

describe('the avatar of the signed-in person', () => {
  it('uses the picture the identity provider gave', async () => {
    auth.session = getSession({ avatar_url: 'https://example.com/ada.png' });
    render(<ImageProbe />);

    await waitFor(() => expect(value()).toBe('https://example.com/ada.png'));
  });

  it('has no picture to show when the provider sent none', async () => {
    auth.session = getSession({});
    render(<ImageProbe />);

    await waitFor(() => expect(value()).toBe('nothing'));
  });

  it('has no picture to show when nobody is signed in', async () => {
    render(<ImageProbe />);

    await waitFor(() => expect(value()).toBe('nothing'));
  });

  it('says nothing once the screen it was for has gone', async () => {
    let release = () => {};
    auth.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    auth.session = getSession({ avatar_url: 'https://example.com/ada.png' });
    const warned = vi.spyOn(console, 'error').mockImplementation(() => {});

    const view = render(<ImageProbe />);
    view.unmount();
    release();
    await auth.gate;

    expect(warned).not.toHaveBeenCalled();
    warned.mockRestore();
  });
});
