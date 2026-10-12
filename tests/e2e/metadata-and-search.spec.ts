import { expect, test } from '@playwright/test';
import { RUN, apiAs, pdfBytes, signInAs } from './helpers';

const KEY = `ref_${RUN.replace(/[^a-z0-9]/g, '')}`;
const AMOUNT = `amt_${RUN.replace(/[^a-z0-9]/g, '')}`;

test.describe.serial('metadata fields and search', () => {
  let docId = '';
  const name = `meta-${RUN}.pdf`;

  test('admin defines typed fields; the document form validates and saves', async ({
    page,
    request,
  }) => {
    const alice = await apiAs(request, 'alice@acme.test');
    docId = await alice.uploadDoc(await alice.root(), name, 'application/pdf', pdfBytes('meta'));

    await signInAs(page, 'Alice');
    await page.goto('/admin/metadata');
    await page.getByRole('button', { name: 'New field' }).click();
    await page.getByLabel('Label').fill('Case reference');
    await page.getByLabel('Key', { exact: false }).first().fill('Bad Key!');
    await page.getByRole('button', { name: 'Create field' }).click();
    await expect(page.getByText(/Lowercase letters, digits and underscores/)).toBeVisible();
    await page.getByLabel('Key', { exact: false }).first().fill(KEY);
    await page.getByLabel('Required on every document').click();
    await page.getByRole('button', { name: 'Create field' }).click();
    await expect(page.getByTestId('meta-def-row').filter({ hasText: KEY })).toContainText(
      'Required',
    );

    await page.getByRole('button', { name: 'New field' }).click();
    await page.getByLabel('Label').fill('Amount');
    await page.getByLabel('Key', { exact: false }).first().fill(AMOUNT);
    await page.getByLabel(/^Type/).selectOption('number');
    await page.getByRole('button', { name: 'Create field' }).click();
    await expect(page.getByTestId('meta-def-row').filter({ hasText: AMOUNT })).toBeVisible();

    await page.goto(`/documents/${docId}`);
    await page.getByRole('tab', { name: 'Metadata' }).click(); // the form has its own tab
    const form = page.getByRole('form', { name: 'Custom metadata' });
    await expect(form.getByLabel(/Case reference/)).toBeVisible();
    await form.getByRole('button', { name: 'Save metadata' }).click();
    await expect(form.getByText('Case reference is required')).toBeVisible();

    await form.getByLabel(/Case reference/).fill(`CASE-${RUN}`);
    await form.getByLabel('Amount').fill('42.5');
    await form.getByRole('button', { name: 'Save metadata' }).click();
    await expect(page.getByText('Metadata saved')).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('form', { name: 'Custom metadata' }).getByLabel(/Case reference/),
    ).toHaveValue(`CASE-${RUN}`);
  });

  test('search by metadata filter finds the document', async ({ page }) => {
    await signInAs(page, 'Alice');
    await page.goto(`/search?q=meta-${RUN}`);
    await expect(page.getByTestId('search-result').filter({ hasText: name })).toBeVisible();
    await page.getByLabel('Field').selectOption(KEY);
    await page.getByLabel('Value', { exact: true }).fill('no-such-value');
    await page.getByRole('button', { name: 'Add filter' }).click();
    await expect(page.getByText('No matches')).toBeVisible();
    await page.getByRole('button', { name: `Remove filter ${KEY}:no-such-value` }).click();
    await page.getByLabel('Value', { exact: true }).fill(`CASE-${RUN}`);
    await page.getByRole('button', { name: 'Add filter' }).click();
    await expect(page.getByTestId('search-result').filter({ hasText: name })).toBeVisible();
  });

  test('archive the fields again', async ({ page }) => {
    await signInAs(page, 'Alice');
    await page.goto('/admin/metadata');
    for (const k of [KEY, AMOUNT]) {
      await page
        .getByTestId('meta-def-row')
        .filter({ hasText: k })
        .getByRole('button', { name: 'Archive' })
        .click();
      await expect(page.getByTestId('meta-def-row').filter({ hasText: k })).toHaveCount(0);
    }
  });
});

test.describe('content search', () => {
  test('finds a word inside a text file, shows match + escaped snippet, scope=name excludes it', async ({
    page,
    request,
  }) => {
    const alice = await apiAs(request, 'alice@acme.test');
    const word = `quokka${RUN.replace(/[^a-z0-9]/g, '')}`;
    const fname = `notes-${RUN}.txt`;
    const docId = await alice.uploadDoc(
      await alice.root(),
      fname,
      'text/plain',
      Buffer.from(`Meeting notes <b>bold</b> <img src=x onerror=alert(1)> the ${word} lives here`),
    );
    await expect
      .poll(
        async () => (await (await alice.get(`/documents/${docId}/processing`)).json()).text_status,
        {
          timeout: 60_000,
        },
      )
      .toBe('extracted');

    await signInAs(page, 'Alice');
    await page.goto(`/documents/${docId}`);
    await page.getByRole('tab', { name: 'Details' }).click(); // processing details have their own tab
    await expect(page.getByTestId('text-status')).toHaveText('extracted');

    await page.goto(`/search?q=${word}`);
    const hit = page.getByTestId('search-result').filter({ hasText: fname });
    await expect(hit).toBeVisible();
    await expect(hit.getByTestId('match-badge')).toHaveText('Content match');
    await expect(hit.locator('mark')).toHaveText(word);
    // markup in the file is shown as text, never executed or rendered
    await expect(hit.locator('b, img, script')).toHaveCount(0);

    await page.getByLabel('Search in').selectOption('name');
    await expect(page.getByText('No matches')).toBeVisible();
    await page.getByLabel('Search in').selectOption('content');
    await expect(hit).toBeVisible();
  });
});

test('image thumbnails come from a fresh thumbnail URL', async ({ page, request }) => {
  const alice = await apiAs(request, 'alice@acme.test');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  const name = `thumb-${RUN}.png`;
  const id = await alice.uploadDoc(await alice.root(), name, 'image/png', png);
  await expect
    .poll(
      async () => (await (await alice.get(`/documents/${id}/processing`)).json()).has_thumbnail,
      {
        timeout: 60_000,
      },
    )
    .toBe(true);

  await signInAs(page, 'Alice');
  const thumbCalls: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes(`/documents/${id}/download-url`))
      thumbCalls.push(r.url());
  });
  await page.goto(`/search?q=thumb-${RUN}`);
  const hit = page.getByTestId('search-result').filter({ hasText: name });
  await expect(hit.getByRole('img', { name: `Thumbnail of ${name}` })).toBeVisible();
  expect(thumbCalls.length).toBeGreaterThan(0);
  await page.goto(`/documents/${id}`);
  await page.getByRole('tab', { name: 'Details' }).click();
  await expect(page.getByTestId('processing-card')).toContainText('Ready');
  await expect(
    page.getByTestId('processing-card').getByRole('img', { name: `Thumbnail of ${name}` }),
  ).toBeVisible();
});
