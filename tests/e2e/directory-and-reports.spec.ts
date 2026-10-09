import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { RUN, signInAs } from './helpers';

test.describe.serial('directory provisioning (static source, dry run)', () => {
  const src = `dir-${RUN}`;
  const emailA = `e2e-dir-${RUN}-a@acme.test`;
  const emailB = `e2e-dir-${RUN}-b@acme.test`;

  test('create source, validate snapshot, preview sync without applying, delete source', async ({
    page,
  }) => {
    await signInAs(page, 'Alice');
    await page.goto('/admin/directory');

    // the secret itself is never asked for: entra sources take an env: reference only
    await page.getByRole('button', { name: 'Add source' }).click();
    const add = page.getByRole('dialog', { name: /Add a provisioning source/ });
    await add.getByLabel('Type').selectOption('entra');
    await add.locator('#ds-name').fill('bad');
    await add.getByLabel('Secret reference').fill('hunter2');
    await add.getByRole('button', { name: 'Add source' }).click();
    await expect(add.getByText('Use the form env:DMS_DIR_<NAME>')).toBeVisible();
    await expect(add.getByText(/Tenant ID is required/)).toBeVisible();
    await add.getByLabel('Type').selectOption('static');
    await add.locator('#ds-name').fill(src);
    await add.getByRole('button', { name: 'Add source' }).click();
    const row = page.getByTestId('source-row').filter({ hasText: src });
    await expect(row).toBeVisible();
    await expect(row.getByRole('button', { name: 'Preview sync' })).toBeDisabled(); // no snapshot yet

    // invalid snapshot is rejected client-side with readable errors
    await row.getByRole('button', { name: 'Upload snapshot' }).click();
    const snap = page.getByRole('dialog', { name: /Snapshot for/ });
    await snap.getByTestId('snapshot-input').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ users: [{ external_id: 'x', email: 'not-an-email' }] })),
    });
    await expect(snap.getByTestId('snapshot-errors')).toContainText(
      'email must be a valid address',
    );
    await expect(snap.getByRole('button', { name: 'Upload snapshot' })).toBeDisabled();

    await snap.getByTestId('snapshot-input').setInputFiles({
      name: 'ok.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          users: [
            { external_id: `ea-${RUN}`, email: emailA, display_name: 'E2E A' },
            { external_id: `eb-${RUN}`, email: emailB, display_name: 'E2E B' },
          ],
          groups: [
            { external_id: `eg-${RUN}`, name: `e2e-group-${RUN}`, member_ids: [`ea-${RUN}`] },
          ],
        }),
      ),
    });
    await expect(snap.getByTestId('snapshot-ok')).toContainText('2 users, 1 group');
    await snap.getByRole('button', { name: 'Upload snapshot' }).click();
    await expect(page.getByText('Snapshot uploaded')).toBeVisible();

    // dry run (the default) -> poll until finished -> stats shown
    await expect(row.getByRole('checkbox', { name: /Preview only/ })).toBeChecked();
    await row.getByRole('button', { name: 'Preview sync' }).click();
    const summary = row.getByTestId('run-summary').first();
    await expect(summary).toHaveAttribute('data-state', /succeeded|aborted|failed/, {
      timeout: 30_000,
    });
    await expect(summary).toContainText('Preview (dry run)');
    await expect(summary).toHaveAttribute('data-state', 'succeeded');

    // a dry run changes nothing
    await page.goto('/admin/users');
    await page.getByRole('searchbox', { name: 'Search', exact: true }).fill(`e2e-dir-${RUN}`);
    await expect(page.getByText('No people match')).toBeVisible();

    // remove the source (with confirmation)
    await page.goto('/admin/directory');
    await page.getByRole('button', { name: `Delete source ${src}` }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove source' }).click();
    await expect(page.getByTestId('source-row').filter({ hasText: src })).toHaveCount(0);
  });
});

test.describe('notification preferences, audit export, reports', () => {
  test('preferences persist across reload', async ({ page }) => {
    await signInAs(page, 'Carol');
    await page.goto('/notifications/preferences');
    const sw = page.getByRole('switch', { name: 'Sharing: in-app notifications' });
    const before = await sw.getAttribute('aria-checked');
    await sw.click();
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await expect(page.getByText('Preferences saved')).toBeVisible();
    await page.reload();
    expect(
      await page
        .getByRole('switch', { name: 'Sharing: in-app notifications' })
        .getAttribute('aria-checked'),
    ).not.toBe(before);
    // restore
    await page.getByRole('switch', { name: 'Sharing: in-app notifications' }).click();
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await expect(page.getByText('Preferences saved').first()).toBeVisible();
    await page.reload();
    expect(
      await page
        .getByRole('switch', { name: 'Sharing: in-app notifications' })
        .getAttribute('aria-checked'),
    ).toBe(before);
    // from the notifications page the link is reachable
    await page.goto('/notifications');
    await expect(page.getByRole('link', { name: 'Preferences' })).toBeVisible();
  });

  test('audit CSV export downloads a real file (and is itself audited)', async ({ page }) => {
    await signInAs(page, 'Alice');
    await page.goto('/admin/audit');
    await page.getByLabel('Action starts with').fill('folder.');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByTestId('audit-row').first()).toBeVisible();
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export CSV/ }).click();
    const file = await dl;
    expect(file.suggestedFilename()).toBe('audit-events.csv');
    const text = fs.readFileSync((await file.path())!, 'utf8').replace(/^﻿/, '');
    expect(text.split(/\r?\n/)[0]).toBe(
      'time_utc,actor_user_id,actor_email,action,outcome,resource_type,resource_id,request_id,metadata',
    );
    expect(text).toContain('folder.');
    // the export itself shows up in the audit log
    await page.getByLabel('Action starts with').fill('audit');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(
      page
        .getByTestId('audit-row')
        .filter({ hasText: /audit\..*export/ })
        .first(),
    ).toBeVisible();
  });

  test('reports page renders real numbers; auditors can open it, members cannot', async ({
    page,
    browser,
  }) => {
    await signInAs(page, 'Alice');
    await page.goto('/admin/reports');
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
    await expect(page.getByTestId('stat-denied')).toHaveText(/^\d+$/);
    await expect(page.getByRole('heading', { name: 'Documents by status' })).toBeVisible();
    await expect(page.getByTestId('bar-row').first()).toBeVisible();
    await page.getByLabel('Period').selectOption('7');
    await expect(page.getByTestId('stat-denied')).toHaveText(/^\d+$/);

    const dctx = await browser.newContext();
    const dave = await dctx.newPage();
    await signInAs(dave, 'Dave');
    await dave.goto('/admin/reports');
    await expect(dave.getByRole('heading', { name: 'Reports' })).toBeVisible();
    await dctx.close();

    const bctx = await browser.newContext();
    const bob = await bctx.newPage();
    await signInAs(bob, 'Bob');
    await bob.goto('/admin/reports');
    await expect(bob.getByText(/limited to organization administrators/)).toBeVisible();
    await bctx.close();
  });

  test('dashboard hides admin-only counters from members', async ({ page }) => {
    await signInAs(page, 'Bob');
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Storage' })).toBeVisible();
    await expect(page.getByText('Scanning', { exact: true })).toHaveCount(0); // admin-only block is hidden
    await expect(page.getByText('NaN')).toHaveCount(0);
    await expect(page.getByTestId('attn-approvals')).toContainText(/approval/);
  });
});
