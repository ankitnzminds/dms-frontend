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
    await expect(page.getByRole('table')).toBeVisible();
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

    await page.goto('/workflows');
    await scan(page, 'not available page');
    await ctx.close();
  });
}
