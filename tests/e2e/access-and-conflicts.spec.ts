import { expect, test } from '@playwright/test';
import { API, RUN, createFolderViaUi, devToken, signInAs } from './helpers';

test.describe('access control dialogs and optimistic concurrency', () => {
  test('manage access: broad grants need acknowledgement; grant and revoke work', async ({
    page,
  }) => {
    await signInAs(page, 'Alice');
    await page.getByRole('link', { name: 'My Files' }).first().click();
    const name = `acl-${RUN}`;
    await createFolderViaUi(page, name);

    await page.getByRole('button', { name: `Actions for ${name}` }).click();
    await page.getByRole('menuitem', { name: /Manage access/ }).click();
    const dlg = page.getByRole('dialog', { name: new RegExp(`Manage access to "${name}"`) });
    await expect(dlg).toBeVisible();

    await dlg.getByLabel('Group', { exact: true }).selectOption({ label: 'Engineering' });
    // folder grants are inherited by default -> broad-grant warning, button locked until acknowledged
    await expect(dlg.getByText('This is a broad grant')).toBeVisible();
    const grant = dlg.getByRole('button', { name: 'Grant access' });
    await expect(grant).toBeDisabled();
    await dlg.getByLabel('I understand who will get access').click();
    await expect(grant).toBeEnabled();
    await grant.click();
    await expect(page.getByText('Access granted')).toBeVisible();
    const row = dlg.getByTestId('acl-row').filter({ hasText: 'Engineering' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Inherited by subfolders');

    await row.getByRole('button', { name: /Revoke access for Engineering/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Revoke access' }).click();
    await expect(page.getByText('Access revoked')).toBeVisible();
  });

  test('stale_version on rename offers Reload and then succeeds', async ({ page, request }) => {
    await signInAs(page, 'Alice');
    await page.getByRole('link', { name: 'My Files' }).first().click();
    const name = `stale-${RUN}`;
    await createFolderViaUi(page, name);
    const href = await page.getByRole('link', { name, exact: true }).getAttribute('href');
    const id = href!.split('/files/')[1]!;

    await page.getByRole('button', { name: `Actions for ${name}` }).click();
    await page.getByRole('menuitem', { name: /Rename/ }).click();
    const input = page.getByLabel('Name', { exact: true });
    await expect(input).toBeVisible();
    // let the dialog load the entity (row_version), then change it behind the UI's back
    await page.waitForTimeout(800);
    const token = await devToken(request, 'alice@acme.test');
    const patch = await request.patch(`${API}/folders/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `other-${RUN}` },
    });
    expect(patch.ok()).toBeTruthy();

    await input.fill(`mine-${RUN}`);
    await page.getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(page.getByText('This item was changed by someone else.')).toBeVisible();
    await page.getByRole('button', { name: 'Reload' }).click();
    await page.getByLabel('Name', { exact: true }).fill(`mine-${RUN}`);
    await page.getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(page.getByText(`Renamed to "mine-${RUN}"`)).toBeVisible();
  });

  test('share dialog: unknown recipients are explained (external sharing not enabled)', async ({
    page,
  }) => {
    await signInAs(page, 'Alice');
    await page.getByRole('link', { name: 'My Files' }).first().click();
    const name = `shr-${RUN}`;
    await createFolderViaUi(page, name);
    await page.getByRole('button', { name: `Actions for ${name}` }).click();
    await page.getByRole('menuitem', { name: /Share/ }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('People (work email addresses)').fill('stranger@outside.test');
    await dlg.getByLabel('People (work email addresses)').press('Enter');
    await dlg.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(dlg.getByText(/sharing outside the organization is not enabled/i)).toBeVisible();
    await expect(dlg).toBeVisible(); // stays open, nothing toasted as success
  });
});
