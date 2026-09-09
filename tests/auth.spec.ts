import { expect, test } from '@playwright/test';

import { createConfirmedUser, deleteUser } from './fixtures';

test.describe('signing in', () => {
  test('a new account lands in chat with a personal and an organization space', async ({
    page,
  }) => {
    const user = await createConfirmedUser('auth');

    try {
      await page.goto('/sign-in');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Password').fill(user.password);
      await page.getByRole('button', { name: 'Sign in' }).click();

      await page.waitForURL('**/chat');

      await page.goto('/spaces');
      await expect(page.getByRole('link', { name: 'Personal' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Everyone' })).toBeVisible();
    } finally {
      await deleteUser(user.userId);
    }
  });

  test('a signed-out visitor asking for the app is sent to sign in', async ({ page }) => {
    await page.goto('/documents');
    await page.waitForURL('**/sign-in**');
    expect(new URL(page.url()).searchParams.get('next')).toBe('/documents');
  });
});
