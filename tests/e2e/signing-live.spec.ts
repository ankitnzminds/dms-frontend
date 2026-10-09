import { expect, test } from '@playwright/test';
import { RUN, apiAs, signInAs } from './helpers';

/**
 * OPTIONAL live spec. Skipped unless RUN_LIVE_SIGNING=1.
 *
 * It exercises the real signing provider wired into the backend dev stack (a deployed Documenso on a free
 * Render instance that can take ~60s to wake). Everything else in the E2E suite runs offline.
 * Documenso is only ever reached through the backend; no provider URL or token exists in this frontend.
 * Nothing is deleted from the provider except through the app's own "Cancel request" button.
 */
test.skip(
  process.env.RUN_LIVE_SIGNING !== '1',
  'set RUN_LIVE_SIGNING=1 to run the live e-signature spec',
);
test.setTimeout(420_000);

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
    '4 0 obj<</Length 60>>stream\nBT /F1 24 Tf 72 700 Td (Agreement to sign) Tj ET\nendstream endobj\n' +
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R/Size 6>>\n%%EOF',
);

test.describe.serial('live e-signature round trip', () => {
  const name = `sign-${RUN}.pdf`;
  let docId = '';
  let requestId = '';

  test('admin enables e-signatures and requests a signature from bob', async ({
    page,
    request,
  }) => {
    const alice = await apiAs(request, 'alice@acme.test');
    docId = await alice.uploadDoc(await alice.root(), name, 'application/pdf', PDF);

    await signInAs(page, 'Alice');
    await page.goto('/admin/settings');
    const sw = page.getByLabel('Enable e-signatures');
    if ((await sw.getAttribute('aria-checked')) !== 'true') {
      await sw.click();
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(page.getByText('Settings saved')).toBeVisible();
    }

    await page.goto(`/documents/${docId}`);
    await expect(page.getByRole('button', { name: 'Request signature' })).toBeEnabled();
    await page.getByRole('button', { name: 'Request signature' }).click();
    const dlg = page.getByRole('dialog', { name: /Request signature/ });
    await dlg.getByRole('combobox', { name: 'Add a colleague' }).fill('bo');
    await dlg.getByRole('option', { name: /Bob Member/ }).click();
    await expect(dlg.getByRole('list', { name: 'Signers' })).toContainText('bob@acme.test');
    await dlg.getByRole('button', { name: 'Request signature' }).click();
    await expect(page.getByText('Signature requested')).toBeVisible({ timeout: 120_000 });

    await page.getByRole('tab', { name: 'Signatures' }).click();
    const card = page.getByTestId('signature-card').first();
    await expect(card).toHaveAttribute('data-state', 'sent');
    requestId = (await (await alice.get(`/documents/${docId}/signature-requests`)).json())[0].id;
  });

  test('bob signs in the overlay, refreshes, and the signed version appears', async ({
    browser,
    page,
    request,
  }) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const bob = await ctx.newPage();
    await signInAs(bob, 'Bob');
    await bob.goto('/signatures');
    const row = bob.getByTestId('signature-row').filter({ hasText: name });
    await expect(row).toContainText('Your turn to sign');
    await bob.goto(`/signatures/${requestId}`);
    await bob.getByRole('button', { name: /^Sign$/ }).click();
    const overlay = bob.getByTestId('signing-overlay');
    await expect(overlay).toBeVisible({ timeout: 120_000 });
    // the secret link is never visible as text
    expect(await bob.locator('body').innerText()).not.toMatch(/https?:\/\/\S*sign\S*/i);

    const f = bob.frameLocator('iframe[title^="Signing page"]');
    // the field box sits at the bottom of the last page; the whole box is one submit overlay button
    const field = f.locator('button.absolute.inset-0.z-10[type=submit]').first();
    await expect(field).toBeVisible({ timeout: 120_000 });
    await field.scrollIntoViewIfNeeded();
    await field.click();
    // type a signature, then Complete -> Sign
    const typeTab = f.getByRole('tab', { name: /type/i });
    if (await typeTab.count()) await typeTab.click();
    await f
      .getByPlaceholder(/sign|name|type/i)
      .first()
      .fill('Bob Member');
    await f
      .getByRole('button', { name: /^(next|sign|save|continue)$/i })
      .first()
      .click()
      .catch(() => {});
    await f
      .getByRole('button', { name: /^complete$/i })
      .first()
      .click({ timeout: 60_000 });
    await f
      .getByRole('button', { name: /^sign$/i })
      .first()
      .click({ timeout: 60_000 });

    await overlay.getByRole('button', { name: /finished signing/ }).click();
    const card = bob.getByTestId('signature-card');
    await expect(card).toHaveAttribute('data-state', 'completed', { timeout: 60_000 });
    await expect(bob.getByTestId('signed-artifact')).toBeVisible();
    await ctx.close();

    // alice sees the signed version on the document and can cancel nothing further
    const alice = await apiAs(request, 'alice@acme.test');
    const versions = await (await alice.get(`/documents/${docId}/versions`)).json();
    expect(versions.length).toBeGreaterThanOrEqual(2);
    void page;
  });

  test('cleanup: turn e-signatures back off', async ({ page }) => {
    await signInAs(page, 'Alice');
    await page.goto('/admin/settings');
    const sw = page.getByLabel('Enable e-signatures');
    if ((await sw.getAttribute('aria-checked')) === 'true') {
      await sw.click();
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(page.getByText('Settings saved')).toBeVisible();
    }
  });
});
