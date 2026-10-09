import { expect, test, type Page } from '@playwright/test';
import { RUN, apiAs, openRow, pdfBytes, rowOf, signInAs } from './helpers';

/** Open a folder in the explorer by its id (deep link). */
const goto = (page: Page, id: string) => page.goto(`/files/${id}`);

test.describe.serial('windows-style explorer', () => {
  let work = ''; // folder id for this spec
  const name = `ex-${RUN}`;

  test('setup: a working folder with files', async ({ request }) => {
    const alice = await apiAs(request, 'alice@acme.test');
    const root = await alice.root();
    work = await alice.mkdir(root, name);
    await alice.mkdir(work, 'dest');
    await alice.mkdir(work, 'other');
    for (const f of ['one.pdf', 'two.pdf', 'three.pdf'])
      await alice.uploadDoc(work, f, 'application/pdf', pdfBytes(f));
  });

  test('selection (click, ctrl, shift, select all), context menus and keyboard', async ({
    page,
  }) => {
    await signInAs(page, 'Alice');
    await goto(page, work);
    await expect(page.getByTestId('item-row')).toHaveCount(5);
    // folders first
    await expect(page.getByTestId('item-row').first()).toHaveAttribute('data-kind', 'folder');

    await rowOf(page, 'one.pdf').click();
    await expect(page.getByTestId('selection-count')).toHaveText('1 selected');
    await rowOf(page, 'two.pdf').click({ modifiers: ['Shift'] }); // rows sort as one, three, two
    await expect(page.getByTestId('selection-count')).toHaveText('3 selected');
    await rowOf(page, 'three.pdf').click({ modifiers: ['Control'] }); // toggles one off
    await expect(page.getByTestId('selection-count')).toHaveText('2 selected');

    // multi-selection context menu
    await rowOf(page, 'one.pdf').click({ button: 'right' });
    const menu = page.getByTestId('context-menu');
    await expect(menu).toContainText('2 items selected');
    await expect(menu.getByTestId('menu-delete')).toBeVisible();
    await expect(menu.getByTestId('menu-download')).toHaveAttribute('data-disabled', '');
    await page.keyboard.press('Escape');

    // file menu per spec (a plain click first: right-clicking inside a multi-selection keeps it)
    await rowOf(page, 'two.pdf').click();
    await rowOf(page, 'two.pdf').click({ button: 'right' });
    for (const id of [
      'open',
      'preview',
      'download',
      'cut',
      'copy',
      'rename',
      'share',
      'copy-link',
      'move-to',
      'properties',
      'versions',
      'delete',
    ])
      await expect(page.getByTestId('context-menu').getByTestId(`menu-${id}`)).toBeVisible();
    await page.keyboard.press('Escape');

    // folder menu
    await rowOf(page, 'dest').click({ button: 'right' });
    await expect(page.getByTestId('context-menu').getByTestId('menu-new-folder')).toBeVisible();
    await expect(page.getByTestId('context-menu').getByTestId('menu-paste')).toHaveAttribute(
      'data-disabled',
      '',
    ); // empty clipboard
    await page.keyboard.press('Escape');

    // background menu (right-click on the empty area under the rows)
    await page.getByTestId('explorer').click({ button: 'right', position: { x: 600, y: 300 } });
    const bg = page.getByTestId('context-menu');
    await expect(bg.getByTestId('menu-new-folder')).toBeVisible();
    await expect(bg.getByTestId('menu-upload-folder')).toBeVisible();
    await expect(bg).toContainText('Sort by');
    await page.keyboard.press('Escape');

    // keyboard: Ctrl+A, Esc, arrows, F2 opens rename, typing in a dialog does not trigger shortcuts
    await page.getByTestId('explorer').focus();
    await page.keyboard.press('Control+a');
    await expect(page.getByTestId('selection-count')).toHaveText('5 selected');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('selection-count')).toHaveCount(0);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('selection-count')).toHaveText('1 selected');
    await rowOf(page, 'three.pdf').click();
    await page.keyboard.press('F2');
    const dlg = page.getByRole('dialog', { name: /Rename/ });
    await expect(dlg).toBeVisible();
    await page.getByLabel('Name', { exact: true }).fill('a'); // letters typed into the dialog must not act on the list
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(page.getByTestId('item-row')).toHaveCount(5);

    // Enter opens a folder, Backspace goes back up
    await rowOf(page, 'dest').click();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/files\//);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('dest');
    await page.getByTestId('explorer').focus();
    await page.keyboard.press('Backspace');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  });

  test('properties panel shows permitted details and honest counts', async ({ page }) => {
    await signInAs(page, 'Alice');
    await goto(page, work);
    await rowOf(page, 'one.pdf').click();
    await page.keyboard.press('Alt+Enter');
    const panel = page.getByTestId('properties-panel');
    await expect(panel).toContainText('one.pdf');
    await expect(panel).toContainText('Version');
    await expect(panel).toContainText('Your permissions');
    // folder: counts note, shown for the current folder when nothing is selected
    await page.getByTestId('explorer').click({ position: { x: 600, y: 300 } });
    await expect(panel).toContainText('Counts cover only what you can see');
    await page.getByRole('button', { name: 'Close properties' }).click();
    await expect(panel).toHaveCount(0);
  });

  test('bulk cut and paste moves items; name conflict offers Keep both / Skip / Cancel', async ({
    page,
    request,
  }) => {
    const alice = await apiAs(request, 'alice@acme.test');
    const dest = (await alice.childId(work, 'dest'))!;
    await alice.uploadDoc(dest, 'two.pdf', 'application/pdf', pdfBytes('existing')); // will conflict

    await signInAs(page, 'Alice');
    await goto(page, work);
    await rowOf(page, 'one.pdf').click();
    await rowOf(page, 'two.pdf').click({ modifiers: ['Control'] });
    await page.keyboard.press('Control+x');
    // cut items are marked (not by colour alone)
    await expect(rowOf(page, 'one.pdf')).toHaveAttribute('data-cut', 'true');
    await expect(rowOf(page, 'one.pdf')).toContainText('Cut');
    await expect(page.getByTestId('tb-paste')).toBeEnabled();

    await openRow(page, 'dest');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('dest');
    await page.getByTestId('explorer').focus();
    await page.keyboard.press('Control+v');
    const conflict = page.getByRole('dialog', { name: /already exist in "dest"/ });
    await expect(conflict).toBeVisible();
    await expect(conflict).toContainText('two.pdf');
    await expect(conflict).toContainText('Replacing is not supported');
    await expect(conflict.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(conflict.getByRole('button', { name: 'Skip these' })).toBeVisible();
    await conflict.getByRole('button', { name: 'Keep both' }).click();
    // per-item report: nothing silent
    const names = async () => alice.names(dest);
    await expect.poll(async () => (await names()).length, { timeout: 20_000 }).toBe(3);
    const after = await names();
    expect(after).toContain('one.pdf');
    expect(after).toContain('two.pdf');
    expect(
      after.some(
        (n) =>
          /^two.*\(.+\)\.pdf$|^two \(\d+\)\.pdf$|two.*copy/i.test(n) ||
          (n !== 'two.pdf' && n.startsWith('two')),
      ),
    ).toBeTruthy();
    // the moved originals are gone from the source
    const left = await alice.names(work);
    expect(left).not.toContain('one.pdf');
    expect(left).not.toContain('two.pdf');
    expect(left).toContain('three.pdf');
  });

  test('copy and paste creates new items; the originals stay', async ({ page, request }) => {
    const alice = await apiAs(request, 'alice@acme.test');
    const other = (await alice.childId(work, 'other'))!;
    await signInAs(page, 'Alice');
    await goto(page, work);
    await rowOf(page, 'three.pdf').click();
    await page.keyboard.press('Control+c');
    await expect(page.getByText(/1 item copied/)).toBeVisible();
    await rowOf(page, 'other').click({ button: 'right' });
    await page.getByTestId('context-menu').getByTestId('menu-paste').click();
    await expect(page.getByText(/1 item copied to "other"/)).toBeVisible();
    expect(await alice.names(other)).toContain('three.pdf');
    expect(await alice.names(work)).toContain('three.pdf');
  });

  test('drag and drop an item onto a folder moves it', async ({ page, request }) => {
    const alice = await apiAs(request, 'alice@acme.test');
    const dnd = await alice.mkdir(work, 'dnd');
    const target = await alice.mkdir(dnd, 'target');
    await alice.uploadDoc(dnd, 'drag.pdf', 'application/pdf', pdfBytes('drag'));
    await signInAs(page, 'Alice');
    await goto(page, dnd);
    await expect(rowOf(page, 'drag.pdf')).toBeVisible();
    await rowOf(page, 'drag.pdf').dragTo(rowOf(page, 'target'));
    await expect(page.getByText(/1 item moved to "target"/)).toBeVisible();
    await expect(rowOf(page, 'drag.pdf')).toHaveCount(0);
    expect(await alice.names(target)).toEqual(['drag.pdf']);
  });

  test('view, sort and columns persist per location via preferences', async ({ page }) => {
    await signInAs(page, 'Alice');
    await goto(page, work);
    await page.getByTestId('tb-view').click();
    await page.getByRole('menuitemradio', { name: 'Large icons' }).click();
    await expect(page.getByRole('listbox', { name: 'Files and folders' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('tb-view').click();
    await page.getByRole('menuitemradio', { name: 'Size' }).click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500); // debounce before the preference is saved
    await page.reload();
    await expect(page.getByRole('listbox', { name: 'Files and folders' })).toBeVisible();
    // another location keeps its own (default) view
    await page.goto('/my-files');
    await expect(page.getByRole('grid', { name: 'Files and folders' })).toBeVisible();
    // restore
    await goto(page, work);
    await page.getByTestId('tb-view').click();
    await page.getByRole('menuitemradio', { name: 'Details' }).click();
    await page.keyboard.press('Escape');
    await page.getByTestId('tb-view').click();
    await page.getByRole('menuitemradio', { name: 'Name' }).click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
  });

  test('Quick Access: pin a folder and see it in the sidebar', async ({ page }) => {
    await signInAs(page, 'Alice');
    await goto(page, work);
    await rowOf(page, 'dest').click({ button: 'right' });
    await page.getByTestId('context-menu').getByTestId('menu-favorite').click();
    await expect(page.getByText(/Added "dest" to Quick Access/)).toBeVisible();
    await expect(page.getByTestId('quick-access-list')).toContainText('dest');
    await rowOf(page, 'dest').click({ button: 'right' });
    await page.getByTestId('context-menu').getByTestId('menu-unfavorite').click();
    await expect(page.getByText(/Removed "dest" from Quick Access/)).toBeVisible();
  });

  test('check out / check in: others get a clear locked message', async ({
    page,
    browser,
    request,
  }) => {
    const alice = await apiAs(request, 'alice@acme.test');
    const id = await alice.uploadDoc(work, 'locked.pdf', 'application/pdf', pdfBytes('lock'));
    const share = await alice.post(`/documents/${id}/shares`, {
      recipients: [{ type: 'user', email: 'bob@acme.test' }],
      actions: ['view', 'preview', 'download', 'rename'],
    });
    expect(share.ok()).toBeTruthy();

    await signInAs(page, 'Alice');
    await goto(page, work);
    await rowOf(page, 'locked.pdf').click({ button: 'right' });
    await page.getByTestId('context-menu').getByTestId('menu-lock').click();
    await expect(page.getByText(/Checked out "locked.pdf"/)).toBeVisible();
    await expect(rowOf(page, 'locked.pdf').getByTestId('lock-badge')).toContainText(
      'Checked out by you',
    );

    const ctx = await browser.newContext();
    const bob = await ctx.newPage();
    await signInAs(bob, 'Bob');
    await bob.goto(`/documents/${id}`);
    await bob.getByRole('button', { name: 'Actions for locked.pdf' }).click();
    await bob.getByRole('menuitem', { name: /Rename/ }).click();
    await bob.getByLabel('Name', { exact: true }).fill('bobs-new-name.pdf');
    await bob.getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(bob.getByText(/checked out by someone else/i).first()).toBeVisible();
    await ctx.close();

    await rowOf(page, 'locked.pdf').click({ button: 'right' });
    await page.getByTestId('context-menu').getByTestId('menu-unlock').click();
    await expect(page.getByText(/Checked in "locked.pdf"/)).toBeVisible();
  });

  test('request access from a discover-only item; the approver decides', async ({
    page,
    browser,
    request,
  }) => {
    const alice = await apiAs(request, 'alice@acme.test');
    const area = `private-area-${RUN}`;
    const priv = await alice.mkdir(await alice.root(), area);
    const grant = await alice.post(`/folders/${priv}/permissions`, {
      subject_type: 'organization',
      actions: ['discover'],
      inherit: false,
    });
    expect(grant.ok()).toBeTruthy();

    const ctx = await browser.newContext();
    const bob = await ctx.newPage();
    await signInAs(bob, 'Bob');
    await bob.goto('/my-files');
    await expect(rowOf(bob, area)).toBeVisible();
    await rowOf(bob, area).click({ button: 'right' });
    await bob.getByTestId('context-menu').getByTestId('menu-request-access').click();
    const dlg = bob.getByRole('dialog', { name: /Request access/ });
    await dlg.getByRole('button', { name: 'Send request' }).click();
    await expect(dlg.getByText('Tell the approver why you need access')).toBeVisible();
    await dlg.getByLabel('Reason').fill('Need the plans for project X');
    await dlg.getByRole('button', { name: 'Send request' }).click();
    await expect(bob.getByText('Access request sent')).toBeVisible();
    await bob.goto('/requests');
    await expect(bob.getByTestId('request-row').filter({ hasText: area })).toContainText('Pending');

    await signInAs(page, 'Alice');
    await page.goto('/requests');
    await page.getByRole('tab', { name: 'To approve' }).click();
    const row = page.getByTestId('request-row').filter({ hasText: area });
    await expect(row).toContainText('Need the plans for project X');
    await row.getByRole('button', { name: 'Decide' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Request approved')).toBeVisible();

    await bob.reload();
    await expect(bob.getByTestId('request-row').filter({ hasText: area })).toContainText(
      'Approved',
    );
    await ctx.close();
  });
});
