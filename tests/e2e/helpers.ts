import { expect, type Page } from '@playwright/test';

export const API = `${process.env.E2E_BACKEND_URL ?? 'http://localhost:8000'}/api/v1`;
/** Unique per run so repeated runs against the same dev database never collide on names. */
export const RUN = process.env.E2E_RUN_ID ?? Date.now().toString(36);

export type Who = 'Alice' | 'Bob' | 'Carol' | 'Dave';

export async function signInAs(page: Page, who: Who) {
  await page.goto('/login');
  await page.getByRole('button', { name: new RegExp(`Sign in as ${who}`) }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(`Welcome, ${who}`);
}

export async function devToken(request: import('@playwright/test').APIRequestContext, email: string) {
  const r = await request.post(`${API}/dev/token`, { data: { email } });
  expect(r.ok()).toBeTruthy();
  return (await r.json()).access_token as string;
}

export async function createFolderViaUi(page: Page, name: string) {
  await page.getByRole('button', { name: 'New folder' }).click();
  await page.getByLabel('Folder name').fill(name);
  await page.getByRole('button', { name: 'Create folder' }).click();
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
}

export const pdfBytes = (marker: string) => Buffer.from(`%PDF-1.4\n% ${marker}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);
