import { expect, test, type Page } from '@playwright/test';
import { signInAs } from './helpers';

async function openAccountMenu(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
}

test.describe('login, session lifecycle and authorization', () => {
  test('a wrong password shows an inline error and stays on the login page', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill('alice@acme.test');
    await page.getByLabel('Password', { exact: true }).fill('definitely-wrong');
    await page.getByRole('button', { name: 'Sign in as User', exact: true }).click();
    await expect(page.getByTestId('login-error')).toContainText('Incorrect email or password');
    await expect(page).toHaveURL(/\/login/);
  });

  test('validation: empty and malformed input is explained before any request', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in as User', exact: true }).click();
    await expect(page.getByText('Enter your email')).toBeVisible();
    await page.getByLabel('Email address').fill('nope');
    await page.getByRole('button', { name: 'Sign in as User', exact: true }).click();
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
  });

  test('password can be revealed; the form works end to end and redirects back to the requested page', async ({
    page,
  }) => {
    await page.goto('/trash');
    await expect(page).toHaveURL(/\/login\?next=%2Ftrash/);
    await page.getByRole('button', { name: /^Use Alice/ }).click();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Sign in as User', exact: true }).click();
    await expect(page).toHaveURL(/\/trash/);
  });

  test('signing out ends access: the back button cannot show data', async ({ page }) => {
    await signInAs(page, 'Alice');
    await page.goto('/my-files');
    await expect(page.getByTestId('explorer')).toBeVisible();
    await openAccountMenu(page);
    await expect(page.getByTestId('role-badge')).toBeVisible();
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goBack();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId('explorer')).toHaveCount(0);
    // a fresh navigation to a protected page is refused too
    await page.goto('/my-files');
    await expect(page).toHaveURL(/\/login/);
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    expect(stored).not.toMatch(/eyJ/); // no JWT left behind
  });

  test('"Sign out of all devices" revokes the session in another tab', async ({ browser }) => {
    const ctx = await browser.newContext();
    const a = await ctx.newPage();
    await signInAs(a, 'Alice');
    // a second, independent session for the same user (separate context = separate browser)
    const ctx2 = await browser.newContext();
    const b = await ctx2.newPage();
    await signInAs(b, 'Alice');
    await b.goto('/my-files');
    await expect(b.getByTestId('explorer')).toBeVisible();

    await openAccountMenu(a);
    await a.getByRole('menuitem', { name: 'Sign out of all devices' }).click();
    await expect(a).toHaveURL(/\/login/);

    // the other session's token is revoked server side: its next request ends the session
    await b.reload();
    await expect(b).toHaveURL(/\/login/, { timeout: 30_000 });
    await ctx.close();
    await ctx2.close();
  });

  test('a member never gets the admin area (and no admin entry in the navigation)', async ({ page }) => {
    await signInAs(page, 'Bob');
    await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0);
    await page.goto('/admin/users');
    await expect(page.getByText(/limited to organization administrators/)).toBeVisible();
  });
});
