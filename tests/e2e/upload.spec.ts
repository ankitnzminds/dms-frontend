import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RUN, apiAs, openRow, pdfBytes, rowOf, signInAs } from './helpers';

const MARKER = 'DMS-TEST-INFECTED-FILE-SIGNATURE';

test.describe.serial('upload: files, folders, drag and drop, conflicts', () => {
  let work = '';
  let tmp = '';

  test.beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-up-'));
  });
  test.afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  test('setup', async ({ request }) => {
    const alice = await apiAs(request, 'alice@acme.test');
    work = await alice.mkdir(await alice.root(), `up-${RUN}`);
  });

  test('choosing a whole multi-level folder recreates the tree and uploads every file', async ({
    page,
    request,
  }) => {
    const top = path.join(tmp, `tree-${RUN}`);
    fs.mkdirSync(path.join(top, 'sub', 'deep'), { recursive: true });
    fs.writeFileSync(path.join(top, 'a.txt'), 'alpha file');
    fs.writeFileSync(path.join(top, 'sub', 'b.txt'), 'bravo file');
    fs.writeFileSync(path.join(top, 'sub', 'deep', 'c.txt'), 'charlie file');
    fs.writeFileSync(path.join(top, 'zero.txt'), ''); // empty files are rejected by the backend
    fs.writeFileSync(path.join(top, 'sub', 'bad.txt'), `%PDF-1.4 ${MARKER}`); // flagged by the dev scanner

    await signInAs(page, 'Alice');
    await page.goto(`/files/${work}`);
    await page.getByTestId('tb-upload').click();
    await page.getByTestId('tb-upload-folder').click(); // opens the (hidden) directory chooser
    await page.getByTestId('upload-folder-input').setInputFiles(top);

    const panel = page.getByRole('region', { name: 'Uploads' });
    await expect(panel).toBeVisible();
    // the empty file is skipped with a visible reason, never sent
    const zero = panel.getByTestId('upload-row').filter({ hasText: 'zero.txt' });
    await expect(zero).toHaveAttribute('data-status', 'skipped');
    await expect(zero).toContainText('Empty files cannot be uploaded.');
    // overall progress is shown
    await expect(panel.getByRole('progressbar', { name: 'Overall upload progress' })).toBeVisible();
    await expect(panel.getByRole('status').first()).toContainText(/Uploads complete/, {
      timeout: 60_000,
    });

    const alice = await apiAs(request, 'alice@acme.test');
    const topId = (await alice.childId(work, `tree-${RUN}`))!;
    expect(topId).toBeTruthy();
    expect((await alice.names(topId)).sort()).toEqual(['a.txt', 'sub']);
    const subId = (await alice.childId(topId, 'sub'))!;
    expect((await alice.names(subId)).sort()).toEqual(['b.txt', 'bad.txt', 'deep']);
    const deepId = (await alice.childId(subId, 'deep'))!;
    expect(await alice.names(deepId)).toEqual(['c.txt']);

    // scan states show in the listing: clean files available, the flagged one quarantined
    await page.goto(`/files/${subId}`);
    await expect(rowOf(page, 'bad.txt').locator('[data-status="quarantined"]')).toBeVisible({
      timeout: 60_000,
    });
    await expect(rowOf(page, 'b.txt').locator('[data-status="processing"]')).toHaveCount(0, {
      timeout: 60_000,
    });
    // quarantined files cannot be downloaded
    await rowOf(page, 'bad.txt').click({ button: 'right' });
    await expect(page.getByTestId('context-menu').getByTestId('menu-download')).toHaveAttribute(
      'data-disabled',
      '',
    );
  });

  test('dropping files from the desktop onto the page uploads into the open folder', async ({
    page,
    request,
  }) => {
    await signInAs(page, 'Alice');
    await page.goto(`/files/${work}`);
    const dt = await page.evaluateHandle(() => {
      const d = new DataTransfer();
      d.items.add(new File(['dropped one'], 'dropped-1.txt', { type: 'text/plain' }));
      d.items.add(new File(['dropped two'], 'dropped-2.txt', { type: 'text/plain' }));
      return d;
    });
    await page.dispatchEvent('[data-testid=drop-zone]', 'drop', { dataTransfer: dt });
    await expect(
      page.getByRole('region', { name: 'Uploads' }).getByRole('status').first(),
    ).toContainText(/Uploads complete/, { timeout: 60_000 });
    const alice = await apiAs(request, 'alice@acme.test');
    const names = await alice.names(work);
    expect(names).toContain('dropped-1.txt');
    expect(names).toContain('dropped-2.txt');
  });

  test('dropping files onto a folder row uploads into that folder', async ({ page, request }) => {
    const alice = await apiAs(request, 'alice@acme.test');
    const into = await alice.mkdir(work, 'drop-target');
    await signInAs(page, 'Alice');
    await page.goto(`/files/${work}`);
    const dt = await page.evaluateHandle(() => {
      const d = new DataTransfer();
      d.items.add(new File(['into folder'], 'into.txt', { type: 'text/plain' }));
      return d;
    });
    await rowOf(page, 'drop-target').dispatchEvent('drop', { dataTransfer: dt });
    await expect(
      page.getByRole('region', { name: 'Uploads' }).getByRole('status').first(),
    ).toContainText(/Uploads complete/, { timeout: 60_000 });
    expect(await alice.names(into)).toEqual(['into.txt']);
  });

  test('name conflict: upload as a new version, keep both, or skip', async ({ page, request }) => {
    const alice = await apiAs(request, 'alice@acme.test');
    const folder = await alice.mkdir(work, 'conflicts');
    const docId = await alice.uploadDoc(folder, 'report.pdf', 'application/pdf', pdfBytes('v1'));
    await alice.uploadDoc(folder, 'keep.pdf', 'application/pdf', pdfBytes('k1'));
    await alice.uploadDoc(folder, 'skip.pdf', 'application/pdf', pdfBytes('s1'));

    await signInAs(page, 'Alice');
    await page.goto(`/files/${folder}`);
    await page.getByTestId('upload-input').setInputFiles([
      { name: 'report.pdf', mimeType: 'application/pdf', buffer: pdfBytes('v2') },
      { name: 'keep.pdf', mimeType: 'application/pdf', buffer: pdfBytes('k2') },
      { name: 'skip.pdf', mimeType: 'application/pdf', buffer: pdfBytes('s2') },
    ]);
    const panel = page.getByRole('region', { name: 'Uploads' });
    const rowFor = (n: string) => panel.getByTestId('upload-row').filter({ hasText: n });
    for (const n of ['report.pdf', 'keep.pdf', 'skip.pdf'])
      await expect(rowFor(n)).toContainText('already exists', { timeout: 30_000 });

    // 1) new version of the existing document
    await rowFor('report.pdf').getByRole('button', { name: 'Upload as new version' }).click();
    await expect(rowFor('report.pdf')).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
    await expect
      .poll(
        async () => (await (await alice.get(`/documents/${docId}`)).json()).latest_version_number,
        { timeout: 30_000 },
      )
      .toBe(2);

    // 2) keep both: upload under a new name
    await rowFor('keep.pdf').getByRole('button', { name: 'Keep both' }).click();
    await rowFor('keep.pdf').getByRole('button', { name: 'Upload as', exact: true }).click();
    await expect.poll(async () => (await alice.names(folder)).length, { timeout: 30_000 }).toBe(4);
    expect(
      (await alice.names(folder)).some((n) => n.startsWith('keep') && n !== 'keep.pdf'),
    ).toBeTruthy();

    // 3) skip
    await rowFor('skip.pdf').getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(rowFor('skip.pdf')).toHaveAttribute('data-status', 'skipped');
    expect((await alice.names(folder)).filter((n) => n.startsWith('skip'))).toEqual(['skip.pdf']);
  });

  test('uploading into a read-only folder is not offered', async ({ page, request }) => {
    const alice = await apiAs(request, 'alice@acme.test');
    const ro = await alice.mkdir(await alice.root(), `ro-${RUN}`);
    // everyone may only see it: no create_child
    await alice.post(`/folders/${ro}/permissions`, {
      subject_type: 'organization',
      actions: ['view', 'discover'],
      inherit: true,
    });
    const ctx = await page.context().browser()!.newContext();
    const bob = await ctx.newPage();
    await signInAs(bob, 'Bob');
    await bob.goto(`/files/${ro}`);
    await expect(bob.getByTestId('tb-upload')).toBeDisabled();
    await ctx.close();
    void openRow;
  });
});
