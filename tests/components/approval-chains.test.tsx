import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { SubmitApprovalDialog } from '@/components/workflows/submit-approval-dialog';
import { ChainEditor } from '@/features/signatures/chain-editor-view';
import { DecisionDialog } from '@/features/workflows/approvals-view';
import type { Task } from '@/features/workflows/hooks';
import { API, server } from '../msw-server';
import { renderApp } from './test-utils';

const approver = (over: Record<string, unknown> = {}) => ({
  user_id: 'u-alice',
  name: 'Alice',
  email: 'alice@acme.test',
  optional: false,
  is_super_approver: false,
  ...over,
});

describe('approval chain editor', () => {
  it('uses approver wording and saves is_super_approver flags per level', async () => {
    server.use(
      http.get(`${API}/folders/f1/approval-chain`, () =>
        HttpResponse.json({ folder_id: 'f1', definition_id: null, levels: [] }),
      ),
      http.get(`${API}/admin/users`, () =>
        HttpResponse.json({
          items: [
            {
              user_id: 'u-alice',
              display_name: 'Alice',
              email: 'alice@acme.test',
              state: 'active',
            },
          ],
          total: 1,
          limit: 100,
          offset: 0,
        }),
      ),
      http.get(`${API}/admin/groups`, () =>
        HttpResponse.json({ items: [], total: 0, limit: 100, offset: 0 }),
      ),
    );
    let body: unknown = null;
    server.use(
      http.put(`${API}/folders/f1/approval-chain`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          folder_id: 'f1',
          definition_id: 'd1',
          levels: [[approver({ is_super_approver: true })]],
        });
      }),
    );
    renderApp(<ChainEditor folderId="f1" kind="approval" />);
    expect(
      await screen.findByText(/files in this folder are submitted to a workflow you choose/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Add level/ }));
    const level = screen.getByTestId('chain-level');
    expect(
      within(level).getByText('Everyone below approves in parallel at this step.'),
    ).toBeInTheDocument();
    await within(level).findByRole('option', { name: 'Alice' });
    await userEvent.selectOptions(
      within(level).getByLabelText('Add approver to level 1'),
      'u-alice',
    );
    await userEvent.click(within(level).getByRole('checkbox', { name: /Super approver/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save chain' }));
    await waitFor(() =>
      expect(body).toEqual({
        levels: [[{ user_id: 'u-alice', optional: false, is_super_approver: true }]],
        group_ids: [[]],
      }),
    );
    expect(await screen.findByText('Approval chain saved.')).toBeInTheDocument();
  });
});

describe('submitting a file to a folder with an approval chain', () => {
  it('shows the chain, needs no workflow choice and calls submit-for-approval', async () => {
    server.use(
      http.get(`${API}/folders/f1/approval-chain`, () =>
        HttpResponse.json({
          folder_id: 'f1',
          definition_id: 'd1',
          levels: [[approver()], [approver({ user_id: 'u-bob', name: 'Bob', optional: true })]],
        }),
      ),
      http.get(`${API}/workflows`, () => HttpResponse.json([])),
    );
    let note: unknown = 'unset';
    server.use(
      http.post(`${API}/documents/d1/submit-for-approval`, async ({ request }) => {
        note = ((await request.json()) as { note: string | null }).note;
        return HttpResponse.json({ id: 'r1' }, { status: 201 });
      }),
    );
    renderApp(
      <SubmitApprovalDialog
        documentId="d1"
        documentName="a.pdf"
        folderId="f1"
        open
        onOpenChange={() => {}}
      />,
    );
    const preview = await screen.findByTestId('approval-chain-preview');
    expect(preview).toHaveTextContent('L1:');
    expect(preview).toHaveTextContent('Bob (optional)');
    expect(screen.queryByLabelText('Workflow')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Submit for\s*approval/ }));
    await waitFor(() => expect(note).toBeNull());
  });
});

describe('super approver decision', () => {
  const task = {
    id: 't1',
    run_id: 'r1',
    document_id: 'd1',
    document_name: 'a.pdf',
    step_index: 0,
    step_name: 'Level 1',
    rule: 'all',
    assignee: { id: 'u', email: 'x', display_name: 'X' },
    status: 'pending',
    due_at: null,
    overdue: false,
    decided_at: null,
    comment: null,
    document_version_number: 1,
    optional: false,
    is_super_approver: true,
  } as unknown as Task;

  it('warns and asks for confirmation before approving', async () => {
    let decided = 0;
    server.use(
      http.post(`${API}/workflow-tasks/t1/decision`, () => {
        decided++;
        return HttpResponse.json(task);
      }),
    );
    renderApp(<DecisionDialog task={task} onClose={() => {}} />);
    expect(screen.getByRole('note')).toHaveTextContent(/super approver/);
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(decided).toBe(0);
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      /immediately bypass every other pending approver at this level and every approver at every level below/,
    );
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: /Approve and bypass the rest/,
      }),
    );
    await waitFor(() => expect(decided).toBe(1));
  });

  it('rejecting needs no override confirmation', async () => {
    let decided = 0;
    server.use(
      http.post(`${API}/workflow-tasks/t1/decision`, () => {
        decided++;
        return HttpResponse.json(task);
      }),
    );
    renderApp(<DecisionDialog task={task} onClose={() => {}} />);
    await userEvent.selectOptions(screen.getByLabelText('Decision'), 'reject');
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(decided).toBe(1));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
