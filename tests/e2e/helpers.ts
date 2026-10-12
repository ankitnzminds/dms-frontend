import { expect, type Page } from '@playwright/test';

export const API = `${process.env.E2E_BACKEND_URL ?? 'http://localhost:8000'}/api/v1`;
/** Unique per run so repeated runs against the same dev database never collide on names. */
export const RUN = process.env.E2E_RUN_ID ?? Date.now().toString(36);

export type Who = 'Alice' | 'Bob' | 'Carol' | 'Dave';

export async function signInAs(page: Page, who: Who) {
  await page.goto('/login');
  await page.getByRole('button', { name: new RegExp(`^Use ${who}`) }).click();
  await page.getByRole('button', { name: 'Sign in as User', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(`Welcome, ${who}`);
}

export async function devToken(
  request: import('@playwright/test').APIRequestContext,
  email: string,
) {
  const r = await request.post(`${API}/dev/token`, { data: { email } });
  expect(r.ok()).toBeTruthy();
  return (await r.json()).access_token as string;
}

export async function createFolderViaUi(page: Page, name: string) {
  await page.getByTestId('tb-upload').click();
  await page.getByRole('menuitem', { name: 'New folder' }).click();
  await page.getByLabel('Folder name').fill(name);
  await page.getByRole('button', { name: 'Create folder' }).click();
  await expect(rowOf(page, name)).toBeVisible();
}

/** A row of the file manager by (exact) item name. */
export const rowOf = (page: Page, name: string) =>
  page.getByTestId('item-row').filter({ has: page.getByText(name, { exact: true }) });

/** Windows-style open: double-click the row. */
export async function openRow(page: Page, name: string) {
  await rowOf(page, name).dblclick();
}

export const pdfBytes = (marker: string) =>
  Buffer.from(`%PDF-1.4\n% ${marker}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);

type Req = import('@playwright/test').APIRequestContext;

export async function apiAs(request: Req, email: string) {
  const token = await devToken(request, email);
  const headers = { Authorization: `Bearer ${token}` };
  return {
    headers,
    async root(): Promise<string> {
      return (await (await request.get(`${API}/folders/root`, { headers })).json()).id;
    },
    async uploadDoc(
      folderId: string,
      name: string,
      mimeType: string,
      buffer: Buffer,
    ): Promise<string> {
      const init = await request.post(`${API}/folders/${folderId}/uploads`, {
        headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
        data: { filename: name, content_type: mimeType, size_bytes: buffer.length },
      });
      expect(init.ok()).toBeTruthy();
      const s = await init.json();
      const put = await request.put(`${API.replace('/api/v1', '')}${s.upload_url}`, {
        headers: { ...headers, 'Content-Type': 'application/octet-stream' },
        data: buffer,
      });
      expect(put.ok()).toBeTruthy();
      const fin = await request.post(`${API}/uploads/${s.id}/finalize`, { headers });
      expect(fin.ok()).toBeTruthy();
      const id = (await fin.json()).document_id as string;
      await expect
        .poll(
          async () =>
            (await (await request.get(`${API}/documents/${id}`, { headers })).json()).status,
          {
            timeout: 60_000,
          },
        )
        .toBe('available');
      return id;
    },
    async post(path: string, data: unknown) {
      return request.post(`${API}${path}`, { headers, data });
    },
    async get(path: string) {
      return request.get(`${API}${path}`, { headers });
    },
    async put(path: string, data?: unknown) {
      return request.put(`${API}${path}`, { headers, data });
    },
    async del(path: string) {
      return request.delete(`${API}${path}`, { headers });
    },
    /** Create a folder below `parent` and return its id. */
    async mkdir(parent: string, name: string): Promise<string> {
      const r = await request.post(`${API}/folders`, {
        headers,
        data: { parent_folder_id: parent, name },
      });
      expect(r.ok()).toBeTruthy();
      return (await r.json()).id;
    },
    /** Names of the children of a folder (folders and documents). */
    async names(folderId: string): Promise<string[]> {
      const r = await request.get(`${API}/folders/${folderId}/children?limit=200`, { headers });
      return ((await r.json()).items as Array<{ name: string }>).map((i) => i.name);
    },
    async childId(folderId: string, name: string): Promise<string | undefined> {
      const r = await request.get(`${API}/folders/${folderId}/children?limit=200`, { headers });
      return ((await r.json()).items as Array<{ id: string; name: string }>).find(
        (i) => i.name === name,
      )?.id;
    },
  };
}
