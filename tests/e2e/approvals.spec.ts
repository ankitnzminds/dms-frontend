import { expect, test } from '@playwright/test';
import { RUN, apiAs, pdfBytes, signInAs } from './helpers';

test.describe.serial('approval workflow with two users', () => {
  const wf = `wf-${RUN}`;
  const doc1 = `approve-${RUN}.pdf`;
  const doc2 = `delegate-${RUN}.pdf`;
  let doc1Id = '';
  let doc2Id = '';

  test('admin builds a workflow; alice submits a document; bob approves in his own session', async ({
    page,
    browser,
    request,
  }) => {
    const alice = await apiAs(request, 'alice@acme.test');
    const root = await alice.root();
    doc1Id = await alice.uploadDoc(root, doc1, 'application/pdf', pdfBytes('a1'));
    doc2Id = await alice.uploadDoc(root, doc2, 'application/pdf', pdfBytes('a2'));

    await signInAs(page, 'Alice');
    await page.goto('/admin/workflows');
    await page.getByRole('button', { name: 'New workflow' }).click();
    const dlg = page.getByRole('dialog', { name: 'New approval workflow' });
    await dlg.locator('#wf-name').fill(wf);
    // validation: a step needs a name and a reviewer
    await dlg.getByRole('button', { name: 'Create workflow' }).click();
    await expect(dlg.getByText('Give the step a name')).toBeVisible();
    await dlg.locator('[id^="step-"][id$="-name"]').fill('Manager review');
    await dlg.getByRole('button', { name: 'Create workflow' }).click();
    await expect(dlg.getByText('Add at least one reviewer')).toBeVisible();
    // reviewer through the member lookup typeahead (works for every role)
    await dlg.getByRole('combobox', { name: 'Add a person' }).fill('bo');
    await dlg.getByRole('option', { name: /Bob Member/ }).click();
    await expect(dlg.getByRole('list', { name: 'Reviewers' })).toContainText('Bob Member');
    await dlg.getByLabel('Approval rule').selectOption('any');
    await dlg.getByLabel('Due (days)').fill('3');
    await dlg.getByRole('button', { name: 'Create workflow' }).click();
    const row = page.getByTestId('workflow-row').filter({ hasText: wf });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Manager review');
    await expect(row).toContainText('due in 3d');

    // submit for approval from the document page
    await page.goto(`/documents/${doc1Id}`);
    await page.getByRole('button', { name: 'Submit for approval' }).click();
    const submit = page.getByRole('dialog', { name: /Submit .* for approval/ });
    await submit.getByLabel('Workflow').selectOption({ label: `${wf} (1 step)` });
    await submit.getByLabel(/Note for reviewers/).fill('Please check section 2');
    await submit.getByRole('button', { name: 'Submit for approval' }).click();
    await expect(page.getByText('Submitted for approval')).toBeVisible();
    await page.getByRole('tab', { name: 'Approvals' }).click();
    const run = page.getByTestId('run-card');
    await expect(run).toHaveAttribute('data-state', 'in_progress');
    await expect(run).toContainText('Manager review');
    await expect(run.getByTestId('run-task')).toContainText('Bob Member');

    // bob, in a separate browser context
    const ctx = await browser.newContext();
    const bob = await ctx.newPage();
    await signInAs(bob, 'Bob');
    await bob.goto('/approvals');
    const task = bob.getByTestId('task-row').filter({ hasText: doc1 });
    await expect(task).toBeVisible();
    await expect(task).toContainText('Please check section 2');
    // the reviewer can open the exact document, and no link points at any folder
    await expect(task.getByRole('link', { name: doc1 })).toHaveAttribute(
      'href',
      `/documents/${doc1Id}`,
    );
    await expect(task.locator('a[href^="/files/"]')).toHaveCount(0);

    // bob got a notification that deep links to the approvals page
    await bob.getByRole('button', { name: /^Notifications/ }).click();
    await expect(
      bob
        .getByRole('dialog')
        .getByRole('link', { name: /approv|review|task|assigned/i })
        .first(),
    ).toHaveAttribute('href', /\/approvals/);
    await bob.keyboard.press('Escape');

    await task.getByRole('button', { name: 'Decide' }).click();
    const decide = bob.getByRole('dialog', { name: /Decide on/ });
    await decide.getByLabel('Comment (optional)').fill('Looks good');
    await decide.getByRole('button', { name: 'Approve' }).click();
    await expect(bob.locator('[data-sonner-toast]', { hasText: 'Approved' })).toBeVisible();
    await expect(bob.getByTestId('task-row').filter({ hasText: doc1 })).toHaveCount(0);
    await ctx.close();

    // alice sees the outcome
    await page.reload();
    await page.getByRole('tab', { name: 'Approvals' }).click();
    await expect(page.getByTestId('run-card')).toHaveAttribute('data-state', 'approved');
    await expect(page.getByTestId('run-task')).toContainText('Approved');
  });

  test('delegation to carol and rejection; the starter can resubmit', async ({ page, browser }) => {
    await signInAs(page, 'Alice');
    await page.goto(`/documents/${doc2Id}`);
    await page.getByRole('button', { name: 'Submit for approval' }).click();
    const submit = page.getByRole('dialog', { name: /Submit .* for approval/ });
    await submit.getByLabel('Workflow').selectOption({ label: `${wf} (1 step)` });
    await submit.getByRole('button', { name: 'Submit for approval' }).click();
    await expect(page.getByText('Submitted for approval')).toBeVisible();

    const bobCtx = await browser.newContext();
    const bob = await bobCtx.newPage();
    await signInAs(bob, 'Bob');
    await bob.goto('/approvals');
    const task = bob.getByTestId('task-row').filter({ hasText: doc2 });
    await task.getByRole('button', { name: 'Delegate' }).click();
    const dlg = bob.getByRole('dialog', { name: /Delegate/ });
    await dlg.getByRole('combobox', { name: 'Delegate to' }).fill('ca');
    await dlg.getByRole('option', { name: /Carol/ }).click();
    await expect(dlg.getByTestId('delegate-picked')).toContainText('Carol');
    await dlg.getByRole('button', { name: 'Delegate', exact: true }).click();
    await expect(bob.getByText(/Delegated to Carol/)).toBeVisible();
    await bobCtx.close();

    const carolCtx = await browser.newContext();
    const carol = await carolCtx.newPage();
    await signInAs(carol, 'Carol');
    await carol.goto('/approvals');
    const ctask = carol.getByTestId('task-row').filter({ hasText: doc2 });
    await expect(ctask).toBeVisible();
    await ctask.getByRole('button', { name: 'Decide' }).click();
    const decide = carol.getByRole('dialog', { name: /Decide on/ });
    await decide.getByLabel('Decision').selectOption('reject');
    await decide.getByLabel('Comment (optional)').fill('Needs rework');
    await decide.getByRole('button', { name: 'Reject' }).click();
    await expect(carol.locator('[data-sonner-toast]', { hasText: 'Rejected' })).toBeVisible();
    await carolCtx.close();

    await page.reload();
    await page.getByRole('tab', { name: 'Approvals' }).click();
    const run = page.getByTestId('run-card');
    await expect(run).toHaveAttribute('data-state', 'rejected');
    await expect(run).toContainText('Needs rework');
    await run.getByRole('button', { name: 'Resubmit' }).click();
    await expect(page.getByText('Resubmitted for approval')).toBeVisible();
  });
});

test('member lookup typeahead works for a plain member (share dialog)', async ({
  page,
  request,
}) => {
  const bob = await apiAs(request, 'bob@acme.test');
  const name = `bobs-${RUN}.pdf`;
  const id = await bob.uploadDoc(await bob.root(), name, 'application/pdf', pdfBytes('b'));
  await signInAs(page, 'Bob');
  await page.goto(`/documents/${id}`);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('combobox', { name: 'Find a colleague' }).fill('ca');
  await dlg.getByRole('option', { name: /Carol/ }).click();
  await expect(dlg.getByText('carol@acme.test')).toBeVisible();
  // policy hints are visible to members now
  await expect(dlg.getByText(/Maximum \d+ days/)).toBeVisible();
});
