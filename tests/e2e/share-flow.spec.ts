import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { API, RUN, createFolderViaUi, devToken, openRow, pdfBytes, signInAs } from './helpers';

/**
 * Mandatory end-to-end scenario: folders -> upload -> scan -> new version -> share -> recipient view
 * (plain-text breadcrumb, no parent access) -> download -> revoke -> audit log.
 */
test.describe.serial('document sharing end to end', () => {
  const dir1 = `dir1-${RUN}`;
  const dirB = `dirB-${RUN}`;
  const fileName = `contract-${RUN}.pdf`;
  const v1 = pdfBytes(`version one ${RUN}`);
  const v2 = pdfBytes(`version two ${RUN}`);
  const expectedPath = `Organization Files > ${dir1} > ${dirB}`;

  let dir1Id = '';
  let dirBId = '';
  let documentId = '';

  test('alice creates folders, uploads, versions and shares', async ({ page }) => {
    // 1. sign in as alice (admin) via development sign-in
    await signInAs(page, 'Alice');

    // 2. dir1 > dirB
    await page.getByRole('link', { name: 'My Files' }).first().click();
    await expect(page).toHaveURL(/\/files\//);
    await createFolderViaUi(page, dir1);
    await openRow(page, dir1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(dir1);
    dir1Id = page.url().split('/files/')[1]!;
    await createFolderViaUi(page, dirB);
    await openRow(page, dirB);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(dirB);
    dirBId = page.url().split('/files/')[1]!;

    // 3. upload a small PDF-like file
    await page
      .getByTestId('upload-input')
      .setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer: v1 });
    const row = page.getByTestId('item-row').filter({ hasText: fileName });
    await expect(row).toBeVisible();

    // 4. processing -> available (the Scanning chip disappears once the worker finishes)
    await expect(row.locator('[data-status="processing"]')).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByRole('region', { name: 'Uploads' })).toContainText(
      /Uploads complete|Uploaded/,
    );

    await row.dblclick();
    await expect(page).toHaveURL(/\/documents\//);
    documentId = page.url().split('/documents/')[1]!;
    await expect(page.getByRole('heading', { level: 1 })).toContainText(fileName);
    await expect(page.getByText('Available', { exact: true }).first()).toBeVisible();

    // 5. upload a new version
    await page
      .getByTestId('version-input')
      .setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer: v2 });
    await page.getByRole('tab', { name: 'Versions' }).click();
    const versions = page.getByTestId('version-row');
    await expect(versions).toHaveCount(2, { timeout: 30_000 });
    await expect(versions.filter({ hasText: 'v2' }).getByText('Clean')).toBeVisible({
      timeout: 60_000,
    });
    await expect(versions.filter({ hasText: 'v2' }).getByText('Current')).toBeVisible();

    // 6. share with bob (view + download, with expiry)
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('do not get access to its folder');
    await dialog.getByLabel('People (work email addresses)').fill('bob@acme.test');
    await dialog.getByLabel('People (work email addresses)').press('Enter');
    await dialog.getByLabel('Viewer + download').check();
    await dialog.getByLabel('Access expires').selectOption('30');
    await dialog.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(page.getByText(/Shared ".*" with 1 recipient/)).toBeVisible();
    await page.getByRole('tab', { name: 'Sharing' }).click();
    await expect(page.getByTestId('share-row')).toContainText('bob@acme.test');
    await expect(page.getByTestId('share-row')).toContainText('Active');
  });

  test('bob sees plain-text breadcrumb, cannot open parents, downloads', async ({
    browser,
    request,
  }) => {
    const ctx = await browser.newContext({ acceptDownloads: true });
    const page = await ctx.newPage();
    await signInAs(page, 'Bob');

    // 7. Shared with me shows the canonical breadcrumb as plain text
    await page.goto('/shared-with-me');
    const row = page.getByTestId('received-share-row').filter({ hasText: fileName });
    await expect(row).toBeVisible();
    const trail = row.locator('nav[aria-label="Location"]');
    await expect(trail).toHaveAttribute('data-path', expectedPath);
    // dir1 and dirB are not navigable for bob: plain text, no links. (The org root is separately
    // authorized for every member, so the API marks it navigable and it may render as a link.)
    await expect(trail.getByRole('link', { name: new RegExp(`${dir1}|${dirB}`) })).toHaveCount(0);
    await expect(trail.locator('[data-navigable="false"]')).toHaveText([
      new RegExp(dir1),
      new RegExp(dirB),
    ]);
    await expect(row.locator(`a[href="/files/${dir1Id}"], a[href="/files/${dirBId}"]`)).toHaveCount(
      0,
    );
    await expect(row.getByText('Download', { exact: true }).first()).toBeVisible();

    // 8. direct URLs to the parents are a neutral not-found state
    for (const id of [dir1Id, dirBId]) {
      await page.goto(`/files/${id}`);
      await expect(page.getByText(/not found, or you do not have access/i)).toBeVisible();
    }

    // 9. bob downloads the shared file (current version = v2)
    await page.goto('/shared-with-me');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: `Download ${fileName}` }).click();
    const dl = await downloadPromise;
    expect(dl.suggestedFilename()).toBe(fileName);
    const saved = await dl.path();
    expect(fs.readFileSync(saved!).equals(v2)).toBeTruthy();

    await ctx.close();
    void request;
  });

  test('alice revokes; bob loses access; audit log shows the events', async ({
    browser,
    page,
    request,
  }) => {
    // 10. alice revokes
    await signInAs(page, 'Alice');
    await page.goto('/shared-by-me');
    const sent = page.getByTestId('sent-share-row').filter({ hasText: fileName });
    await expect(sent).toContainText('Active');
    await sent.getByRole('button', { name: /Revoke share/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Revoke share' }).click();
    await expect(page.getByText('Share revoked')).toBeVisible();

    // bob reloads: gone by default, "Access revoked" when inactive are shown, and not openable
    const ctx = await browser.newContext();
    const bob = await ctx.newPage();
    await signInAs(bob, 'Bob');
    await bob.goto('/shared-with-me');
    await expect(bob.getByTestId('received-share-row').filter({ hasText: fileName })).toHaveCount(
      0,
    );
    await bob.getByLabel('Show expired & revoked').click();
    const revoked = bob.getByTestId('received-share-row').filter({ hasText: fileName });
    await expect(revoked).toContainText('Access revoked');
    await expect(revoked.getByRole('link')).toHaveCount(0);
    await bob.goto(`/documents/${documentId}`);
    await expect(bob.getByText(/not found, or you do not have access/i)).toBeVisible();
    await ctx.close();

    // download attempt fails at the API too
    const token = await devToken(request, 'bob@acme.test');
    const r = await request.post(`${API}/documents/${documentId}/download-url`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {},
    });
    expect([403, 404]).toContain(r.status());

    // 11. audit log
    await page.goto('/admin/audit');
    for (const action of ['share.created', 'share.revoked', 'document.downloaded']) {
      await page.getByLabel('Action starts with').fill(action);
      await page.getByRole('button', { name: 'Apply filters' }).click();
      await expect(page.getByTestId('audit-row').filter({ hasText: action }).first()).toBeVisible();
    }
  });
});
