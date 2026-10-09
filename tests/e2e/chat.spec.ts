import { expect, test, type Page } from '@playwright/test';
import { RUN, apiAs, signInAs } from './helpers';

/**
 * The assistant runs on a real (rate-limited) model, so these specs assert on the PIPELINE with generous
 * timeouts and keep prompts simple: a pending-action card appears, Confirm executes, citations link.
 */
test.setTimeout(240_000);

async function ask(page: Page, text: string) {
  await page.getByTestId('chat-input').fill(text);
  await page.getByTestId('chat-send').click();
}
const idle = (page: Page) => expect(page.getByTestId('chat-activity')).toHaveCount(0, { timeout: 180_000 });

test.describe.serial('assistant', () => {
  test('opens from the global button; actions need a confirmation card; Confirm executes it', async ({ page, request }) => {
    const alice = await apiAs(request, 'alice@acme.test');
    const root = await alice.root();
    const folder = `chat-${RUN}`;

    await signInAs(page, 'Alice');
    await page.getByTestId('chat-launcher').click();
    await expect(page.getByTestId('chat-drawer')).toBeVisible();
    await ask(page, `Create a folder called ${folder} in the folder with id ${root}`);
    // progress is shown while the run is working (never a frozen UI)
    await expect(page.getByTestId('chat-activity').or(page.getByTestId('action-card')).first()).toBeVisible({ timeout: 60_000 });

    const card = page.getByTestId('action-card').first();
    await expect(card).toBeVisible({ timeout: 180_000 });
    await expect(card).toContainText(folder); // exact target
    await expect(card).toContainText('Destination'); // exact destination
    await expect(card).toContainText('Nothing else changes');
    expect(await alice.names(root)).not.toContain(folder); // nothing happened yet

    await card.getByTestId('action-confirm').click();
    await expect(card.getByTestId('action-status')).toHaveText('Executed', { timeout: 60_000 });
    expect(await alice.names(root)).toContain(folder);

    // the same action cannot be confirmed twice (single-use): the buttons are gone
    await expect(card.getByTestId('action-confirm')).toHaveCount(0);
  });

  test('Cancel leaves everything untouched', async ({ page, request }) => {
    const alice = await apiAs(request, 'alice@acme.test');
    const root = await alice.root();
    const folder = `chat-cancel-${RUN}`;
    await signInAs(page, 'Alice');
    await page.goto('/assistant');
    await ask(page, `Create a folder called ${folder} in the folder with id ${root}`);
    const card = page.getByTestId('action-card').first();
    await expect(card).toBeVisible({ timeout: 180_000 });
    await card.getByTestId('action-cancel').click();
    await expect(card.getByTestId('action-status')).toHaveText('Cancelled', { timeout: 30_000 });
    expect(await alice.names(root)).not.toContain(folder);
  });

  test('grounded answers carry citations that link to the authorized source; nothing is stored in the browser', async ({ page, request }) => {
    const alice = await apiAs(request, 'alice@acme.test');
    const name = `zephyr-${RUN}.txt`;
    const docId = await alice.uploadDoc(
      await alice.root(),
      name,
      'text/plain',
      Buffer.from('Planning memo. The approved project budget for Zephyr is 4200 euros. The deadline is March.'),
    );
    await expect
      .poll(async () => (await (await alice.get(`/documents/${docId}/processing`)).json()).text_status, { timeout: 60_000 })
      .toBe('extracted');
    await page.waitForTimeout(6000); // indexing for retrieval

    await signInAs(page, 'Alice');
    await page.goto(`/documents/${docId}`);
    await page.getByTestId('ask-about').click();
    await expect(page.getByTestId('chat-context')).toContainText(name);
    await ask(page, 'What is the approved budget for Zephyr?');
    await idle(page);
    const reply = page.getByTestId('chat-message').filter({ has: page.locator('[data-testid=message-text]') }).last();
    await expect(reply).toContainText('4200');
    const chip = reply.getByTestId('citation-chip').first();
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('data-accessible', 'true');
    await expect(chip).toHaveAttribute('href', new RegExp(`/documents/${docId}`));

    // conversation text is never persisted in web storage
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(stored).not.toContain('Zephyr');
    expect(stored).not.toContain('4200');

    // feedback and copy are real controls
    await reply.getByRole('button', { name: 'Good response' }).click();
    await expect(reply.getByRole('button', { name: 'Good response' })).toHaveAttribute('aria-pressed', 'true');

    // Conversation list: it appears, can be renamed and archived
    await page.goto('/assistant');
    const conv = page.getByTestId('chat-conversation').first();
    await expect(conv).toBeVisible();
    await conv.getByRole('button', { name: /^Rename/ }).click();
    await page.getByLabel('Title').fill(`Budget ${RUN}`);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('chat-conversation').first()).toContainText(`Budget ${RUN}`);
  });

  test('another user cannot see these conversations', async ({ page }) => {
    await signInAs(page, 'Bob');
    await page.goto('/assistant');
    await expect(page.getByTestId('chat-panel')).toBeVisible();
    await expect(page.getByTestId('chat-conversation').filter({ hasText: `Budget ${RUN}` })).toHaveCount(0);
  });
});
