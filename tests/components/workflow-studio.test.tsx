import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { FolderWorkflowButton } from '@/components/workflows/folder-workflow-button';
import { StartWorkflowDialog } from '@/components/workflows/start-workflow-dialog';
import { WorkflowRunCard } from '@/components/workflows/workflow-run-card';
import { BindingsDialog, scopeSummary } from '@/features/automations/bindings-dialog';
import { MyWorkflowsView } from '@/features/workflow-studio/my-workflows-view';
import { WorkflowRunsView } from '@/features/workflow-studio/workflow-runs-view';
import { API, server } from '../msw-server';
import { renderApp } from './test-utils';

const START = [
  {
    id: 'w1',
    name: 'Contract review',
    description: 'Legal reviews the contract',
    instructions: 'Attach the signed copy first',
    who_can_start: 'editors',
  },
  { id: 'w2', name: 'Archive it', description: null, instructions: null, who_can_start: 'admins' },
];

const run = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  automation_name: 'Contract review',
  status: 'waiting',
  started_by_email: 'mia@acme.test',
  resource_name: 'deal.pdf',
  resource_type: 'document',
  resource_id: 'd1',
  note: 'rush please',
  error: null,
  created_at: new Date().toISOString(),
  finished_at: null,
  steps: [
    { label: 'Human approval', status: 'waiting', branch: null, error: null, finished_at: null },
  ],
  ...over,
});

function startable(items: unknown[]) {
  server.use(http.get(`${API}/automations/startable`, () => HttpResponse.json(items)));
}

describe('StartWorkflowDialog', () => {
  it('lists the workflows available here and starts the chosen one with the note', async () => {
    startable(START);
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(`${API}/automations/w2/start`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ run_id: 'r9', status: 'queued' }, { status: 202 });
      }),
    );
    renderApp(
      <StartWorkflowDialog type="document" id="d1" name="deal.pdf" open onOpenChange={() => {}} />,
    );
    const group = await screen.findByRole('group', { name: 'Workflows' });
    expect(within(group).getByText('Attach the signed copy first')).toBeInTheDocument();
    expect(within(group).getByText('Admins')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Start$/ })).toBeDisabled(); // nothing chosen yet
    await userEvent.click(within(group).getByRole('radio', { name: /Archive it/ }));
    await userEvent.type(screen.getByLabelText(/Note/), 'for the audit');
    await userEvent.click(screen.getByRole('button', { name: /^Start$/ }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toEqual({ resource_type: 'document', resource_id: 'd1', note: 'for the audit' });
  });

  it('preselects the only option', async () => {
    startable([START[0]]);
    renderApp(
      <StartWorkflowDialog type="folder" id="f1" name="Inbox" open onOpenChange={() => {}} />,
    );
    const radio = await screen.findByRole('radio', { name: /Contract review/ });
    expect(radio).toBeChecked();
    expect(screen.getByRole('button', { name: /^Start$/ })).toBeEnabled();
  });

  it('says plainly when nothing is available instead of offering a dead button', async () => {
    startable([]);
    renderApp(
      <StartWorkflowDialog type="document" id="d1" name="deal.pdf" open onOpenChange={() => {}} />,
    );
    expect(await screen.findByText('No workflow is available for this item')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Start$/ })).toBeDisabled();
  });
});

describe('FolderWorkflowButton', () => {
  it('only appears when a workflow can be started on the folder', async () => {
    startable([]);
    const { unmount } = renderApp(<FolderWorkflowButton folderId="f1" name="Inbox" />);
    await waitFor(() => expect(screen.queryByTestId('tb-start-workflow')).not.toBeInTheDocument());
    unmount();
    startable([START[0]]);
    renderApp(<FolderWorkflowButton folderId="f1" name="Inbox" />);
    expect(await screen.findByTestId('tb-start-workflow')).toBeInTheDocument();
  });
});

describe('WorkflowRunCard', () => {
  it('shows each step in words, with the exit that was taken', () => {
    renderApp(
      <WorkflowRunCard
        run={
          run({
            status: 'succeeded',
            steps: [
              {
                label: 'Human approval',
                status: 'succeeded',
                branch: 'approved',
                error: null,
                finished_at: null,
              },
              {
                label: 'Notify user(s)',
                status: 'succeeded',
                branch: null,
                error: null,
                finished_at: null,
              },
            ],
          }) as never
        }
      />,
    );
    const card = screen.getByTestId('workflow-run');
    expect(card).toHaveAttribute('data-status', 'succeeded');
    expect(within(card).getByText('Done')).toBeInTheDocument();
    expect(within(card).getByText('Approved')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'deal.pdf' })).toHaveAttribute(
      'href',
      '/documents/d1',
    );
    expect(within(card).getByText(/rush please/)).toBeInTheDocument();
  });

  it('points a waiting run at My approvals and hides the item on its own page', () => {
    renderApp(<WorkflowRunCard run={run() as never} showItem={false} />);
    expect(screen.getByText('Waiting for a person')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My approvals' })).toHaveAttribute(
      'href',
      '/approvals',
    );
    expect(screen.queryByRole('link', { name: 'deal.pdf' })).not.toBeInTheDocument();
  });

  it('shows a failure message', () => {
    renderApp(
      <WorkflowRunCard
        run={
          run({
            status: 'failed',
            error: 'Copy: no access',
            steps: [
              {
                label: 'Copy',
                status: 'failed',
                branch: null,
                error: 'no access',
                finished_at: null,
              },
            ],
          }) as never
        }
      />,
    );
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Copy: no access');
  });
});

describe('MyWorkflowsView', () => {
  it('explains how to start one when there are none', async () => {
    server.use(
      http.get(`${API}/automation-runs/mine`, () =>
        HttpResponse.json({ items: [], total: 0, limit: 10, offset: 0 }),
      ),
    );
    renderApp(<MyWorkflowsView />);
    expect(await screen.findByText('You have not started a workflow yet')).toBeInTheDocument();
  });

  it('lists my runs and says how many are still going', async () => {
    server.use(
      http.get(`${API}/automation-runs/mine`, () =>
        HttpResponse.json({ items: [run()], total: 1, limit: 10, offset: 0 }),
      ),
    );
    renderApp(<MyWorkflowsView />);
    expect(await screen.findByTestId('workflow-run')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 in progress');
  });
});

describe('BindingsDialog', () => {
  const automation = {
    id: 'a1',
    name: 'Tag contracts',
    binding_mode: 'additive',
    priority: 0,
    row_version: 3,
    trigger: { key: 'file_created', params: { path: '/Contracts', extensions: ['pdf'] } },
  };

  it('describes the scope in words', () => {
    expect(scopeSummary(automation as never)).toBe(
      '/Contracts and everything below it, only .pdf files',
    );
    expect(scopeSummary({ trigger: { key: 'file_created', params: {} } } as never)).toBe(
      'Everywhere',
    );
  });

  it('saves the chosen mode and priority', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.patch(`${API}/admin/automations/a1`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...automation, ...body });
      }),
    );
    renderApp(<BindingsDialog automation={automation as never} onClose={() => {}} />);
    const priority = await screen.findByLabelText('Priority');
    expect(priority).toBeDisabled(); // priority only matters for exclusive workflows
    await userEvent.click(screen.getByRole('radio', { name: /Exclusive/ }));
    await userEvent.clear(priority);
    await userEvent.type(priority, '7');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({ binding_mode: 'exclusive', priority: 7 });
  });

  it('refuses a priority outside 0-1000', async () => {
    renderApp(<BindingsDialog automation={automation as never} onClose={() => {}} />);
    await userEvent.click(await screen.findByRole('radio', { name: /Exclusive/ }));
    const priority = screen.getByLabelText('Priority');
    await userEvent.clear(priority);
    await userEvent.type(priority, '5000');
    expect(screen.getByText('Use a whole number from 0 to 1000.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});

describe('WorkflowRunsView (admin)', () => {
  it('lists every run and passes the filters to the server', async () => {
    const seen: string[] = [];
    server.use(
      http.get(`${API}/admin/automations`, () =>
        HttpResponse.json({
          items: [{ id: 'a1', name: 'Tag contracts' }],
          total: 1,
          limit: 100,
          offset: 0,
        }),
      ),
      http.get(`${API}/admin/automation-runs`, ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({
          items: [
            {
              id: 'r1',
              automation_id: 'a1',
              automation_name: 'Tag contracts',
              status: 'waiting',
              event_key: 'manual:abc',
              trigger_context: { resource: { name: 'deal.pdf' } },
              created_at: new Date().toISOString(),
            },
          ],
          total: 1,
          limit: 25,
          offset: 0,
        });
      }),
    );
    renderApp(<WorkflowRunsView />);
    const row = await screen.findByTestId('run-row');
    expect(within(row).getByText('Tag contracts')).toBeInTheDocument();
    expect(within(row).getByText('Started by a person')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'failed');
    await waitFor(() => expect(seen.some((s) => s.includes('status=failed'))).toBe(true));
  });
});
