import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = {
  name: null as string | null,
  image: null as string | null,
};

vi.mock('@/hooks/use-current-user-name', () => ({
  useCurrentUserName: () => session.name,
}));

vi.mock('@/hooks/use-current-user-image', () => ({
  useCurrentUserImage: () => session.image,
}));

const { CurrentUserAvatar } = await import('./current-user-avatar');

/**
 * jsdom fetches nothing, so an avatar would sit in its loading state forever and
 * the picture would never reach the page. This is the browser having finished.
 */
class LoadedImage {
  complete = true;
  naturalWidth = 1;
  crossOrigin: string | null = null;
  referrerPolicy = '';
  src = '';
  addEventListener() {}
  removeEventListener() {}
}

beforeEach(() => {
  session.name = null;
  session.image = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the avatar of whoever is signed in', () => {
  it('takes a letter from each of a first and last name', () => {
    session.name = 'Ada Lovelace';
    render(<CurrentUserAvatar />);

    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('reads a dotted email address as a name rather than showing the address', () => {
    session.name = 'ada.lovelace@example.com';
    render(<CurrentUserAvatar />);

    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('stops at two letters however many names someone has', () => {
    session.name = 'Ada Byron King Lovelace';
    render(<CurrentUserAvatar />);

    expect(screen.getByText('AB')).toBeInTheDocument();
  });

  it('makes do with one letter for a single name', () => {
    session.name = 'ada';
    render(<CurrentUserAvatar />);

    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('shows a question mark rather than a blank circle when no name has arrived yet', () => {
    render(<CurrentUserAvatar />);

    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('shows a question mark for an address with no name in front of it', () => {
    session.name = '@example.com';
    render(<CurrentUserAvatar />);

    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('shows the picture someone signed up with, labelled with their name', () => {
    vi.stubGlobal('Image', LoadedImage);
    session.name = 'Ada Lovelace';
    session.image = 'https://example.com/ada.png';
    render(<CurrentUserAvatar />);

    expect(screen.getByRole('img', { name: 'Ada Lovelace' })).toHaveAttribute(
      'src',
      'https://example.com/ada.png',
    );
  });

  it('labels the picture generically when the account carries no name', () => {
    vi.stubGlobal('Image', LoadedImage);
    session.image = 'https://example.com/ada.png';
    render(<CurrentUserAvatar />);

    expect(screen.getByRole('img', { name: 'Your avatar' })).toBeInTheDocument();
  });
});
