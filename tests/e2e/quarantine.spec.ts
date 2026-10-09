import { expect, test } from '@playwright/test';
import { RUN, signInAs } from './helpers';

/**
 * The backend's dev/test scanner flags any upload whose bytes contain this harmless marker.
 * (Deliberately NOT the EICAR string, which antivirus software deletes from disk.)
 */
const MARKER = 'DMS-TEST-INFECTED-FILE-SIGNATURE';

test('a flagged upload ends up quarantined and is listed for admins', async ({ page }) => {
  const name = `flagged-${RUN}.pdf`;
  await signInAs(page, 'Alice');
  await page.getByRole('link', { name: 'My Files' }).first().click();
  await expect(page).toHaveURL(/\/files\//);

  await page.getByTestId('upload-input').setInputFiles({
    name,
    mimeType: 'application/pdf',
    buffer: Buffer.from(`%PDF-1.4 ${MARKER}`),
  });
  const row = page.getByTestId('item-row').filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row.locator('[data-status="quarantined"]')).toBeVisible({ timeout: 60_000 });

  // never offer download for a non-available file
  await row.getByRole('button', { name: `Actions for ${name}` }).click();
  await expect(page.getByRole('menuitem', { name: 'Download' })).toHaveAttribute(
    'data-disabled',
    '',
  );
  await page.keyboard.press('Escape');

  await page.goto('/admin/quarantine');
  await expect(page.getByTestId('quarantine-row').filter({ hasText: name })).toBeVisible();
});
