import { expect, test } from '@playwright/test';

test.describe('the shell', () => {
  // jsdom has no hydration, so this cannot be caught by a unit test. React refuses to patch an
  // attribute mismatch, so a selected state the server could not know stays absent for good.
  test('the theme toggle says which theme is selected once the page has hydrated', async ({
    page,
  }) => {
    await page.goto('/');

    const light = page.getByRole('button', { name: 'Light' });
    const dark = page.getByRole('button', { name: 'Dark' });

    await dark.click();
    await expect(dark).toHaveAttribute('aria-pressed', 'true');
    await expect(light).toHaveAttribute('aria-pressed', 'false');

    await page.reload();
    await expect(page.getByRole('button', { name: 'Dark' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('every row of the shell shares one width, header and footer included', async ({ page }) => {
    await page.goto('/pricing');

    const rows = await page.evaluate(() => {
      const left = (selector: string) => {
        const el = document.querySelector(selector);
        return el ? Math.round(el.getBoundingClientRect().left) : null;
      };
      return {
        header: left('header > div'),
        main: left('main > div'),
        footer: left('footer > div'),
      };
    });

    expect(rows.header).not.toBeNull();
    expect(rows.main).toBe(rows.header);
    expect(rows.footer).toBe(rows.header);
  });

  test('nothing scrolls sideways at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 900 });

    for (const route of ['/', '/pricing', '/sign-in']) {
      await page.goto(route);
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflows, `${route} scrolls sideways`).toBe(false);
    }
  });
});
