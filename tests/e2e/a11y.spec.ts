import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signInAs } from './helpers';

/** Automated WCAG 2.x A/AA scan (axe-core). Catches contrast, names, roles; it does not replace manual testing. */
async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = results.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) e.g. ${v.nodes[0]?.target.join(' ')}`,
  );
  expect(summary, `${label}: axe violations`).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`axe: key screens in ${scheme} theme`, async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: scheme });
    const page = await ctx.newPage();

    await page.goto('/login');
    await expect(page.getByText('Development sign-in')).toBeVisible();
    await scan(page, 'login');

    await signInAs(page, 'Alice');
    await page.waitForLoadState('networkidle');
    await scan(page, 'dashboard');

    await page.getByRole('link', { name: 'My Files' }).first().click();
    await expect(page).toHaveURL(/\/files\//);
    await expect(page.getByRole('grid', { name: 'Files and folders' })).toBeVisible();
    await scan(page, 'my files');

    await page.goto('/shared-by-me');
    await page.waitForLoadState('networkidle');
    await scan(page, 'shared by me');

    await page.goto('/admin/users');
    await expect(page.getByTestId('member-row').first()).toBeVisible();
    await scan(page, 'admin users');

    await page.goto('/admin/audit');
    await expect(page.getByTestId('audit-row').first()).toBeVisible();
    await scan(page, 'audit log');

    await page.goto('/admin/identity');
    await scan(page, 'not available page');

    for (const [path, ready, label] of [
      ['/approvals', 'heading:My approvals', 'approvals'],
      ['/signatures', 'heading:Signatures', 'signatures'],
      [
        '/notifications/preferences',
        'heading:Notification preferences',
        'notification preferences',
      ],
      ['/admin/settings', 'heading:Organization settings', 'settings'],
      ['/admin/workflows', 'heading:Approval workflows', 'workflow admin'],
      ['/admin/metadata', 'heading:Metadata fields', 'metadata admin'],
      ['/admin/governance', 'heading:Governance', 'governance'],
      ['/admin/directory', 'heading:Directory provisioning', 'directory'],
      ['/admin/reports', 'heading:Reports', 'reports'],
      ['/trash', 'heading:Trash', 'trash'],
      ['/search?q=a', 'heading:Results for', 'search'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: ready.split(':')[1]! }).first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      await scan(page, label);
    }

    // a document page (tabs, metadata, processing cards)
    await page.goto('/my-files');
    await page.getByTestId('item-row').filter({ hasText: /.pdf$/ }).first().dblclick();
    await expect(page.getByRole('tab', { name: 'Approvals' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await scan(page, 'document page');
    await ctx.close();
  });
}
