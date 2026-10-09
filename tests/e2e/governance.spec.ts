import { expect, test } from '@playwright/test';
import { RUN, apiAs, pdfBytes, signInAs } from './helpers';

test.describe.serial('governance: legal holds, retention, delete forever', () => {
  test('legal hold: adding a file blocks delete (with reason), release needs a reason', async ({
    page,
    request,
  }) => {
    const alice = await apiAs(request, 'alice@acme.test');
    const root = await alice.root();
    const name = `held-${RUN}.pdf`;
    const docId = await alice.uploadDoc(root, name, 'application/pdf', pdfBytes('held'));

    await signInAs(page, 'Alice');
    await page.goto('/admin/governance');
    await page.getByRole('tab', { name: 'Legal holds' }).click();
    await page.getByRole('button', { name: 'New hold' }).click();
    await page.getByLabel('Name').fill(`hold-${RUN}`);
    await page.getByRole('button', { name: 'Create hold' }).click();
    const row = page.getByTestId('hold-row').filter({ hasText: `hold-${RUN}` });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Items' }).click();
    const dlg = page.getByRole('dialog', { name: new RegExp(`hold-${RUN}`) });
    await dlg.getByLabel('Add a file or folder to this hold').fill(`held-${RUN}`);
    await dlg
      .getByRole('list', { name: 'Search results' })
      .getByRole('button', { name: 'Add' })
      .click();
    await expect(dlg.getByTestId('hold-item')).toContainText(name);
    await dlg.getByRole('button', { name: 'Done' }).click();

    // the document page shows the hold and disables Delete with the reason
    await page.goto(`/documents/${docId}`);
    await expect(page.getByTestId('protection-badges')).toContainText('Legal hold');
    await page.getByRole('button', { name: `Actions for ${name}` }).click();
    const del = page.getByRole('menuitem', { name: /Move to trash/ });
    await expect(del).toHaveAttribute('data-disabled', '');
    await expect(del).toHaveAttribute('title', /legal hold/i);
    await page.keyboard.press('Escape');

    // release: a reason is mandatory
    await page.goto('/admin/governance');
    await page.getByRole('tab', { name: 'Legal holds' }).click();
    await page
      .getByTestId('hold-row')
      .filter({ hasText: `hold-${RUN}` })
      .getByRole('button', { name: /Release/ })
      .click();
    await page.getByRole('button', { name: 'Release hold' }).click();
    await expect(page.getByText('Enter a reason for releasing this hold')).toBeVisible();
    await page.getByLabel('Reason').fill('Matter closed');
    await page.getByRole('button', { name: 'Release hold' }).click();
    await expect(page.getByTestId('hold-row').filter({ hasText: `hold-${RUN}` })).toContainText(
      'Released',
    );

    await page.goto(`/documents/${docId}`);
    await expect(page.getByTestId('protection-badges')).toHaveCount(0);
  });

  test('delete forever is blocked by a legal hold (409) and works after release', async ({
    page,
    request,
  }) => {
    const alice = await apiAs(request, 'alice@acme.test');
    const root = await alice.root();
    const name = `purge-hold-${RUN}.pdf`;
    const docId = await alice.uploadDoc(root, name, 'application/pdf', pdfBytes('purge'));
    expect(
      (
        await request.delete(
          `${process.env.E2E_BACKEND_URL ?? 'http://localhost:8000'}/api/v1/documents/${docId}`,
          { headers: alice.headers },
        )
      ).ok(),
    ).toBeTruthy();
    const hold = await (
      await alice.post('/admin/legal-holds', { name: `purge-hold-${RUN}` })
    ).json();
    expect(
      (
        await alice.post(`/admin/legal-holds/${hold.id}/items`, {
          resource_id: docId,
          resource_type: 'document',
        })
      ).ok(),
    ).toBeTruthy();

    await signInAs(page, 'Alice');
    await page.goto('/trash');
    const row = page.getByTestId('trash-row').filter({ hasText: name });
    await row.getByRole('button', { name: `Delete ${name} forever` }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('It cannot be undone.');
    await confirm.getByRole('button', { name: 'Delete forever' }).click();
    await expect(confirm.getByRole('alert')).toContainText(/legal hold/i);
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(row).toBeVisible();

    expect(
      (await alice.post(`/admin/legal-holds/${hold.id}/release`, { reason: 'e2e cleanup' })).ok(),
    ).toBeTruthy();
    await row.getByRole('button', { name: `Delete ${name} forever` }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete forever' }).click();
    await expect(page.getByText(`Deleted "${name}" forever`)).toBeVisible();
    await expect(page.getByTestId('trash-row').filter({ hasText: name })).toHaveCount(0);
  });

  test('retention policy blocks delete forever until it is removed', async ({ page, request }) => {
    const alice = await apiAs(request, 'alice@acme.test');
    const root = await alice.root();
    const name = `retained-${RUN}.pdf`;
    const docId = await alice.uploadDoc(root, name, 'application/pdf', pdfBytes('retained'));
    expect(
      (
        await request.delete(
          `${process.env.E2E_BACKEND_URL ?? 'http://localhost:8000'}/api/v1/documents/${docId}`,
          { headers: alice.headers },
        )
      ).ok(),
    ).toBeTruthy();

    await signInAs(page, 'Alice');
    await page.goto('/admin/governance');
    await page.getByRole('button', { name: 'New policy' }).click();
    await page.getByLabel('Name').fill(`keep-${RUN}`);
    await page.getByLabel('Minimum retention (days)').fill('0');
    await page.getByRole('button', { name: 'Create policy' }).click();
    await expect(page.getByText('Enter a whole number of days (1 or more)')).toBeVisible();
    await page.getByLabel('Minimum retention (days)').fill('7');
    await page.getByRole('button', { name: 'Create policy' }).click();
    const policy = page.getByTestId('retention-row').filter({ hasText: `keep-${RUN}` });
    await expect(policy).toBeVisible();
    await expect(policy).toContainText('Keep at least 7 days');

    await page.goto('/trash');
    const row = page.getByTestId('trash-row').filter({ hasText: name });
    await row.getByRole('button', { name: `Delete ${name} forever` }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete forever' }).click();
    await expect(page.getByRole('alertdialog').getByRole('alert')).toContainText(
      /retention policy protects this item until/,
    );
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();

    // remove the policy (with confirmation) -> delete forever now succeeds
    await page.goto('/admin/governance');
    await page.getByRole('button', { name: `Delete policy keep-${RUN}` }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete policy' }).click();
    await expect(page.getByTestId('retention-row').filter({ hasText: `keep-${RUN}` })).toHaveCount(
      0,
    );
    await page.goto('/trash');
    await page
      .getByTestId('trash-row')
      .filter({ hasText: name })
      .getByRole('button', { name: `Delete ${name} forever` })
      .click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete forever' }).click();
    await expect(page.getByText(`Deleted "${name}" forever`)).toBeVisible();
  });

  test('auditors see governance read-only', async ({ page }) => {
    await signInAs(page, 'Dave');
    await page.goto('/admin/governance');
    await expect(page.getByText('Read-only').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'New policy' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Legal holds' }).click();
    await expect(page.getByRole('button', { name: 'New hold' })).toHaveCount(0);
  });
});
