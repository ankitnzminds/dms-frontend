import { expect, test } from '@playwright/test';
import { RUN, apiAs, signInAs } from './helpers';

// A real (minimal) one-page PDF so a browser PDF viewer can render it.
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
    '4 0 obj<</Length 44>>stream\nBT /F1 24 Tf 20 100 Td (Hello DMS) Tj ET\nendstream endobj\n' +
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R/Size 6>>\n%%EOF',
);

// Real Chrome (the bundled headless shell has no PDF viewer).
test.use({ channel: 'chrome' });

test('inline PDF preview is framed by the app (backend allows the frame origin)', async ({
  page,
  request,
}, testInfo) => {
  const alice = await apiAs(request, 'alice@acme.test');
  const name = `preview-${RUN}.pdf`;
  const id = await alice.uploadDoc(await alice.root(), name, 'application/pdf', PDF);

  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  const framed: Array<{ url: string; status: number; type: string | undefined }> = [];
  page.on('response', async (r) => {
    if (r.url().includes('/downloads/') && r.request().resourceType() === 'document')
      framed.push({ url: r.url(), status: r.status(), type: r.headers()['content-type'] });
  });

  await signInAs(page, 'Alice');
  await page.goto(`/documents/${id}`);
  const frame = page.getByTitle(`Preview of ${name}`);
  await expect(frame).toBeVisible();
  await expect.poll(() => framed.length, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(framed[0]!.status).toBe(200);
  expect(framed[0]!.type).toContain('application/pdf');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: testInfo.outputPath('pdf-preview.png') });
  // no frame-ancestors / CSP violation for the framed preview
  expect(
    consoleErrors.filter((e) =>
      /violates the following Content Security Policy|Refused to frame/i.test(e),
    ),
  ).toEqual([]);
  // and the response carries no X-Frame-Options
  const head = await request.get(framed[0]!.url);
  expect(head.headers()['x-frame-options']).toBeUndefined();
});
