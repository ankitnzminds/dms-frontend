import { expect, test, type Page } from '@playwright/test';
import { RUN, createFolderViaUi, openRow, pdfBytes, rowOf, signInAs } from './helpers';

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function uploadAndWait(
  page: Page,
  name: string,
  buffer: Buffer,
  mimeType = 'application/pdf',
) {
  await page.getByTestId('upload-input').setInputFiles({ name, mimeType, buffer });
  const row = page.getByTestId('item-row').filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row.locator('[data-status="processing"]')).toHaveCount(0, { timeout: 60_000 });
  return row;
}

async function menu(page: Page, name: string, item: RegExp | string) {
  await page.getByRole('button', { name: `Actions for ${name}` }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

test.describe.serial('file management as alice', () => {
  const work = `work-${RUN}`;
  const target = `target-${RUN}`;
  let workUrl = '';

  test('folders: create, conflict is shown inline, nested navigation + breadcrumb links', async ({
    page,
  }) => {
    await signInAs(page, 'Alice');
    await page.getByRole('link', { name: 'My Files' }).first().click();
    await createFolderViaUi(page, work);

    // duplicate name -> inline error, dialog stays open
    await page.getByRole('button', { name: 'New folder' }).click();
    await page.getByLabel('Folder name').fill(work);
    await page.getByRole('button', { name: 'Create folder' }).click();
    await expect(page.getByText(/already exists here/)).toBeVisible();
    await page.keyboard.press('Escape');

    // empty-name validation (client side)
    await page.getByRole('button', { name: 'New folder' }).click();
    await page.getByRole('button', { name: 'Create folder' }).click();
    await expect(page.getByText('Enter a name')).toBeVisible();
    await page.keyboard.press('Escape');

    await openRow(page, work);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(work);
    workUrl = page.url();
    await createFolderViaUi(page, target);
    // the breadcrumb for navigable ancestors is a link
    await expect(
      page
        .getByRole('navigation', { name: 'Location' })
        .getByRole('link', { name: 'Organization Files' }),
    ).toBeVisible();
  });

  test('rename, star, move, copy, trash, restore, search, preview', async ({ page }) => {
    await signInAs(page, 'Alice');
    await page.goto(workUrl);
    const file = `notes-${RUN}.pdf`;
    await uploadAndWait(page, file, pdfBytes('notes'));

    // rename
    const renamed = `renamed-${RUN}.pdf`;
    await menu(page, file, /Rename/);
    await page.getByLabel('Name', { exact: true }).fill(renamed);
    await page.getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(page.getByTestId('item-row').filter({ hasText: renamed })).toBeVisible();

    // star -> Starred page -> unstar
    await menu(page, renamed, /Add to Quick Access/);
    await expect(page.getByText(/Added "renamed.*to Quick Access/)).toBeVisible();
    await page.goto('/starred');
    await expect(page.getByTestId('item-row').filter({ hasText: renamed })).toBeVisible();
    await menu(page, renamed, /Remove star/);
    await expect(page.getByTestId('item-row').filter({ hasText: renamed })).toHaveCount(0);

    // copy into target
    await page.goto(workUrl);
    await menu(page, renamed, /Copy/);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: new RegExp(target) })
      .click();
    await page.getByLabel('Name for the copy (optional)').fill(`copy-${RUN}.pdf`);
    await page.getByRole('button', { name: 'Copy here' }).click();
    await expect(page.getByText(/Copied as/)).toBeVisible();

    // move into target (folder picker only offers folders)
    await menu(page, renamed, /^Move to…/);
    const dlg = page.getByRole('dialog');
    await expect(dlg).toContainText('Choose a destination');
    await dlg.getByRole('button', { name: new RegExp(target) }).click();
    await dlg.getByRole('button', { name: 'Move here' }).click();
    // the copy made above already holds this name in the target: choose Keep both
    await expect(page.getByRole('dialog', { name: /already exist/ })).toBeVisible();
    await page.getByRole('button', { name: 'Keep both' }).click();
    await expect(page.getByText(/1 item moved to/)).toBeVisible();
    await expect(page.getByTestId('item-row').filter({ hasText: renamed })).toHaveCount(0);

    // inside target: two copies? (original moved + copy would conflict by name -> copy got auto name or error)
    await openRow(page, target);
    await expect(page.getByTestId('item-row').filter({ hasText: renamed }).first()).toBeVisible();

    // search shows it with a breadcrumb
    await page.getByLabel('Search files and folders').fill(`renamed-${RUN}`);
    await expect(page).toHaveURL(/\/search\?q=/);
    const hit = page.getByTestId('search-result').filter({ hasText: renamed }).first();
    await expect(hit).toBeVisible();
    await expect(hit.locator('nav[aria-label="Location"]')).toContainText(work);

    // delete -> trash -> restore
    await page.goto(workUrl);
    await openRow(page, target);
    const first = page.getByTestId('item-row').filter({ hasText: renamed }).first();
    await first.getByRole('button', { name: `Actions for ${renamed}` }).click();
    await page.getByRole('menuitem', { name: /Move to Trash/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Move to trash' }).click();
    await expect(page.getByText(/1 item moved to trash/)).toBeVisible();
    await page.goto('/trash');
    const trashed = page.getByTestId('trash-row').filter({ hasText: renamed }).first();
    await expect(trashed).toBeVisible();
    await trashed.getByRole('button', { name: /Restore/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText(/Restored "/)).toBeVisible();
  });

  test('trash restore with a name conflict asks for a new name', async ({ page }) => {
    await signInAs(page, 'Alice');
    await page.goto(workUrl);
    const name = `dup-${RUN}.pdf`;
    await uploadAndWait(page, name, pdfBytes('one'));
    await menu(page, name, /Move to Trash/);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Move to trash' }).click();
    await expect(page.getByTestId('item-row').filter({ hasText: name })).toHaveCount(0);
    await uploadAndWait(page, name, pdfBytes('two')); // same name is free again

    await page.goto('/trash');
    await page
      .getByTestId('trash-row')
      .filter({ hasText: name })
      .first()
      .getByRole('button', { name: /Restore/ })
      .click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('dialog', { name: 'Choose a new name' })).toBeVisible();
    await page.getByLabel('New name', { exact: true }).fill(`dup-restored-${RUN}.pdf`);
    await page.getByRole('button', { name: 'Restore with this name' }).click();
    await expect(page.getByText(/Restored "dup-restored/)).toBeVisible();
  });

  test('bulk delete reports per-item results', async ({ page }) => {
    await signInAs(page, 'Alice');
    await page.goto(workUrl);
    const a = `bulk-a-${RUN}.pdf`;
    const b = `bulk-b-${RUN}.pdf`;
    await uploadAndWait(page, a, pdfBytes('a'));
    await uploadAndWait(page, b, pdfBytes('b'));
    await page.getByRole('checkbox', { name: `Select ${a}` }).click();
    await page.getByRole('checkbox', { name: `Select ${b}` }).click();
    await expect(page.getByRole('toolbar', { name: 'Bulk actions' })).toContainText('2 selected');
    await expect(
      page.getByRole('toolbar').getByRole('button', { name: 'Move', exact: true }),
    ).toBeDisabled();
    await page.getByRole('toolbar').getByRole('button', { name: 'Move to trash' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Move to trash' }).click();
    await expect(page.getByRole('dialog')).toContainText('2 of 2 moved to trash');
    await page.getByRole('button', { name: 'Close' }).first().click();
    await expect(page.getByTestId('item-row').filter({ hasText: a })).toHaveCount(0);
  });

  test('image preview renders inline from a fresh URL', async ({ page }) => {
    await signInAs(page, 'Alice');
    await page.goto(workUrl);
    const name = `pixel-${RUN}.png`;
    const row = await uploadAndWait(page, name, PNG, 'image/png');
    await row.dblclick();
    const img = page.getByRole('img', { name: `Preview of ${name}` });
    await expect(img).toBeVisible();
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth))
      .toBe(1);
  });
});
