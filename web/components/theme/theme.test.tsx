import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from './theme-provider';
import { ThemeToggle } from './theme-toggle';

const systemPrefersDark = { current: false };

// jsdom ships no matchMedia, and next-themes reads it to resolve "system".
function stubPrefersColorScheme() {
  vi.stubGlobal('matchMedia', (media: string) => ({
    media,
    matches: media.includes('prefers-color-scheme: dark') && systemPrefersDark.current,
    addListener: () => {},
    removeListener: () => {},
  }));
}

const chosenTheme = () => document.documentElement.getAttribute('data-theme');

const press = (label: string) => userEvent.click(screen.getByRole('button', { name: label }));

beforeEach(() => {
  systemPrefersDark.current = false;
  stubPrefersColorScheme();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('choosing a theme', () => {
  it('writes the choice onto the document, which is the hook every token in the stylesheet hangs off', async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    await press('Dark');

    expect(chosenTheme()).toBe('dark');
  });

  it('marks the option the reader is on, and only that one', async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    await press('Light');

    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('remembers the choice, so the next visit opens in the theme the reader picked', async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    await press('Dark');

    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('follows the operating system until the reader chooses for themselves', () => {
    systemPrefersDark.current = true;
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true');
    expect(chosenTheme()).toBe('dark');
  });

  it('goes back to following the system after the reader has been on a fixed theme', async () => {
    systemPrefersDark.current = true;
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    await press('Light');
    await press('System');

    expect(chosenTheme()).toBe('dark');
  });

  it('claims nothing is chosen before the stored theme is known, so the server and the first render agree', () => {
    render(<ThemeToggle />);

    for (const label of ['System', 'Light', 'Dark']) {
      expect(screen.getByRole('button', { name: label })).not.toHaveAttribute('aria-pressed');
    }
  });
});
