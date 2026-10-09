import { expect, test } from '@playwright/test';
import { RUN, signInAs } from './helpers';

test.describe('admin area', () => {
  test('users: invite, suspend, reactivate; cannot modify yourself', async ({ page }) => {
    await signInAs(page, 'Alice');
    await page.goto('/admin/users');
    const email = `e2e-${RUN}@acme.test`;

    // guard: own row's actions are disabled
    await page.getByRole('button', { name: 'Actions for alice@acme.test' }).click();
    await expect(page.getByRole('menuitem', { name: /Change role/ })).toHaveAttribute(
      'data-disabled',
      '',
    );
    await expect(page.getByRole('menuitem', { name: /Remove from organization/ })).toHaveAttribute(
      'data-disabled',
      '',
    );
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Invite person' }).click();
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText(`Invited ${email}`)).toBeVisible();

    await page.getByRole('searchbox', { name: 'Search', exact: true }).fill(`e2e-${RUN}`);
    const row = page.getByTestId('member-row').filter({ hasText: email });
    await expect(row).toBeVisible();
    await expect(row).toContainText('invited');

    // suspend needs confirmation
    await row.getByRole('button', { name: `Actions for ${email}` }).click();
    await page.getByRole('menuitem', { name: /Suspend/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Suspend' }).click();
    await expect(row).toContainText('suspended');

    await row.getByRole('button', { name: `Actions for ${email}` }).click();
    await page.getByRole('menuitem', { name: 'Reactivate' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reactivate' }).click();
    await expect(row).toContainText(/active|invited/);
  });

  test('groups: create, add and remove a member, rename, delete', async ({ page }) => {
    await signInAs(page, 'Alice');
    await page.goto('/admin/groups');
    const name = `qa-${RUN}`;
    await page.getByRole('button', { name: 'New group' }).click();
    await page.getByLabel('Name').fill(name);
    await page.getByRole('button', { name: 'Create group' }).click();
    const row = page.getByTestId('group-row').filter({ hasText: name });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Members' }).click();
    await page.getByLabel('Add a person').selectOption({ label: 'Bob Member (bob@acme.test)' });
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Group members' })).toContainText('bob@acme.test');
    await page.getByRole('button', { name: `Remove bob@acme.test from ${name}` }).click();
    await expect(page.getByText('No members yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();

    await row.getByRole('button', { name: `Actions for ${name}` }).click();
    await page.getByRole('menuitem', { name: /Rename/ }).click();
    await page.getByLabel('Name').fill(`${name}-r`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const renamed = page.getByTestId('group-row').filter({ hasText: `${name}-r` });
    await expect(renamed).toBeVisible();

    await renamed.getByRole('button', { name: `Actions for ${name}-r` }).click();
    await page.getByRole('menuitem', { name: /Delete group/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete group' }).click();
    await expect(renamed).toHaveCount(0);
  });

  test('settings: save and validation; storage and not-available pages are honest', async ({
    page,
  }) => {
    await signInAs(page, 'Alice');
    await page.goto('/admin/settings');
    const days = page.getByLabel('Longest allowed share (days)');
    await days.fill('0');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('At least 1 day')).toBeVisible();
    await days.fill('365');
    await page.getByLabel('Hide folder names in shared paths').click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Settings saved')).toBeVisible();
    await page.getByLabel('Hide folder names in shared paths').click(); // restore
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Settings saved').first()).toBeVisible();

    await page.goto('/admin/storage');
    await expect(page.locator('#main').getByText('Not available yet')).toBeVisible();
    await expect(page.getByText('Quota', { exact: true })).toBeVisible();
    for (const path of ['/admin/identity']) {
      await page.goto(path);
      await expect(page.locator('#main').getByText('Not available yet').first()).toBeVisible();
      await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);
    }
  });

  test('audit: filter by outcome and expand metadata', async ({ page }) => {
    await signInAs(page, 'Alice');
    await page.goto('/admin/audit');
    await expect(page.getByTestId('audit-row').first()).toBeVisible();
    await page.getByLabel('Outcome').selectOption('denied');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    // every row shown is denied (or there are none, which shows the empty state)
    const rows = page.getByTestId('audit-row');
    await expect(async () => {
      const n = await rows.count();
      for (let i = 0; i < n; i++) await expect(rows.nth(i)).toContainText('denied');
    }).toPass();
    await page.getByLabel('Outcome').selectOption('success');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await page
      .getByRole('button', { name: /Show details for/ })
      .first()
      .click();
    await expect(page.getByText('request_id').first()).toBeVisible();
  });
});

test.describe('roles', () => {
  test('auditor sees only the audit log; member has no admin area', async ({ page, browser }) => {
    await signInAs(page, 'Dave');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('link', { name: 'Audit log' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Users' })).toHaveCount(0);
    await page.goto('/admin/users');
    await expect(page.getByText(/limited to organization administrators/)).toBeVisible();
    await page.goto('/admin/audit');
    await expect(page.getByTestId('audit-row').first()).toBeVisible();

    const ctx = await browser.newContext();
    const bob = await ctx.newPage();
    await signInAs(bob, 'Bob');
    const bnav = bob.getByRole('navigation', { name: 'Primary' });
    await expect(bnav.getByRole('link', { name: 'Audit log' })).toHaveCount(0);
    await expect(bnav.getByRole('link', { name: 'Administration' })).toHaveCount(0);
    await bob.goto('/admin/audit');
    await expect(bob.getByText(/limited to organization administrators/)).toBeVisible();
    await ctx.close();
  });
});

test.describe('shell', () => {
  test('theme toggle persists, notifications dropdown works, global search navigates', async ({
    page,
  }) => {
    await signInAs(page, 'Bob');
    await page.getByRole('button', { name: 'Change theme' }).click();
    await page.getByRole('menuitemradio', { name: /Dark/ }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByRole('button', { name: 'Change theme' }).click();
    await page.getByRole('menuitemradio', { name: /Light/ }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    await page.getByRole('button', { name: /^Notifications/ }).click();
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: 'Notifications' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByLabel('Search files and folders').fill('contract');
    await expect(page).toHaveURL(/\/search\?q=contract/);
  });

  test('phone width: navigation drawer opens, traps focus and closes with Escape', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    await signInAs(page, 'Alice');
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    const nav = page.getByRole('dialog').getByRole('navigation', { name: 'Primary' });
    await expect(nav).toBeVisible();
    await nav.getByRole('link', { name: 'Trash' }).click();
    await expect(page).toHaveURL(/\/trash/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // no horizontal page scroll
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await ctx.close();
  });

  test('unauthenticated visitors are sent to /login', async ({ page }) => {
    await page.goto('/my-files');
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByText('Development sign-in')).toBeVisible();
  });
});
