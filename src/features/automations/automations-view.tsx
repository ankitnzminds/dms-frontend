'use client';

import {
  Copy,
  History,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Workflow as WorkflowIcon,
  Archive,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { PaginationBar } from '@/components/file-browser/pagination-bar';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, Input } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { friendlyMessage } from '@/lib/api-client';
import { formatDateTime, formatRelative, titleCase } from '@/lib/format';
import {
  useArchive,
  useAutomations,
  useCreateAutomation,
  useDuplicate,
  useSetAutomationEnabled,
  type Automation,
} from './api';
import { PublishDialog } from './publish-dialog';
import { RunsDialog, RUN_TONE } from './runs-dialog';
import { TestDialog } from './test-dialog';
import { WorkflowWizard } from './wizard';
import { wizardAction } from './definition';

const PAGE = 25;

const STATE_TONE = {
  draft: 'neutral',
  enabled: 'ok',
  disabled: 'neutral',
  running: 'info',
  failed: 'danger',
  needs_attention: 'warn',
  archived: 'outline',
} as const;

function lastAction(a: Automation) {
  if (!a.last_run_at) return <span className="text-faint">Never</span>;
  return (
    <span title={a.last_run_summary ?? undefined}>
      <Badge tone={RUN_TONE[a.last_run_status ?? 'skipped']}>{a.last_run_status}</Badge>{' '}
      <span className="text-muted">{formatRelative(a.last_run_at)}</span>
    </span>
  );
}

/** Admin > Workflows > Manage Workflows: IF THIS / THEN THAT automations. */
export function AutomationsView() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const list = useAutomations({ q, limit: PAGE, offset });
  const enable = useSetAutomationEnabled();
  const archive = useArchive();
  const duplicate = useDuplicate();
  const createBlank = useCreateAutomation();

  const [wizard, setWizard] = useState<{ existing: Automation | null } | null>(null);
  const [runsOf, setRunsOf] = useState<Automation | null>(null);
  const [testOf, setTestOf] = useState<Automation | null>(null);
  const [toArchive, setToArchive] = useState<Automation | null>(null);
  const [toEnable, setToEnable] = useState<Automation | null>(null);
  const [toPublish, setToPublish] = useState<Automation | null>(null);

  function toggle(a: Automation, enabled: boolean) {
    enable.mutate(
      { id: a.id, enabled },
      {
        onSuccess: () => toast.success(enabled ? `“${a.name}” enabled` : `“${a.name}” disabled`),
        onError: (e) => toast.error(friendlyMessage(e)),
      },
    );
  }

  async function newCanvas() {
    try {
      const r = await createBlank.mutateAsync({
        name: `Workflow #${(list.data?.total ?? 0) + 1}`,
        editor_mode: 'canvas',
        trigger: { key: 'file_created', params: {} },
        graph: {
          nodes: [{ id: 'start', type: 'start', params: {}, position: { x: 0, y: 0 } }],
          edges: [],
        },
        activate: false,
        confirm_high_risk: false,
        allow_invalid: true,
      });
      router.push(`/admin/automations/${r.id}`);
    } catch (e) {
      toast.error(friendlyMessage(e));
    }
  }

  return (
    <>
      <PageHeader
        title="Manage Workflows"
        description="Automations that run when something happens (IF THIS → THEN THAT). They are saved as drafts: nothing runs until you publish and enable it. Approval workflows for people are under Workflows."
        actions={
          <>
            <Button variant="primary" onClick={() => setWizard({ existing: null })}>
              <Plus /> Add Workflow
            </Button>
            <Button onClick={() => void newCanvas()} disabled={createBlank.isPending}>
              <WorkflowIcon /> New visual workflow
            </Button>
          </>
        }
      />
      <form
        className="mb-3 flex items-end gap-3"
        role="search"
        onSubmit={(e) => e.preventDefault()}
      >
        <Field id="wf-q" label="Search" className="w-64">
          {(p) => (
            <Input
              {...p}
              type="search"
              placeholder="Workflow name"
              value={q}
              onChange={(e) => (setQ(e.target.value), setOffset(0))}
            />
          )}
        </Field>
      </form>
      <Panel>
        {list.isPending ? (
          <SkeletonRows rows={5} label="Loading workflows" />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={WorkflowIcon}
            title="No results found"
            description={
              q ? 'No workflow matches that name.' : 'Add a workflow to automate a routine task.'
            }
            action={
              !q && (
                <Button variant="primary" onClick={() => setWizard({ existing: null })}>
                  <Plus /> Add Workflow
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] border-collapse text-[13px]">
                <caption className="sr-only">Workflows</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th scope="col" className="px-3 py-2 font-medium">
                      Workflow Name
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      IF THIS
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      THEN THAT
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Last Check
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Last Action
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Enabled
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((a) => {
                    const wizardEditable =
                      a.editor_mode === 'wizard' && wizardAction(a.graph) !== null;
                    return (
                      <tr
                        key={a.id}
                        className="border-b border-line align-top last:border-0"
                        data-testid="workflow-row"
                      >
                        <td className="px-3 py-2">
                          <p className="font-medium">{a.name}</p>
                          <p className="flex flex-wrap items-center gap-1 text-xs text-muted">
                            <Badge tone={STATE_TONE[a.state]}>{titleCase(a.state)}</Badge>
                            {a.editor_mode === 'canvas' && <Badge tone="outline">Visual</Badge>}
                            {a.has_unpublished_changes && (
                              <Badge tone="warn">Unpublished changes</Badge>
                            )}
                            {a.high_risk && <Badge tone="warn">High risk</Badge>}
                          </p>
                          <p className="text-xs text-faint">
                            {a.created_by_email ?? 'Unknown'} · updated{' '}
                            {formatRelative(a.updated_at)}
                          </p>
                          {a.attention_reason && (
                            <p className="text-xs text-warn">{a.attention_reason}</p>
                          )}
                        </td>
                        <td className="max-w-56 px-3 py-2">{a.if_this}</td>
                        <td className="max-w-56 px-3 py-2">{a.then_that}</td>
                        <td className="px-3 py-2 text-muted">
                          {a.last_checked_at
                            ? formatRelative(a.last_checked_at)
                            : a.status === 'draft'
                              ? '—'
                              : 'Never'}
                          {a.next_check_at && (
                            <span className="block text-xs text-faint" title={a.next_check_at}>
                              next {formatDateTime(a.next_check_at)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">{lastAction(a)}</td>
                        <td className="px-3 py-2">
                          <Switch
                            checked={a.enabled}
                            disabled={a.status !== 'published' || enable.isPending}
                            aria-label={`${a.enabled ? 'Disable' : 'Enable'} ${a.name}`}
                            onCheckedChange={(v) =>
                              v && a.high_risk ? setToEnable(a) : toggle(a, v)
                            }
                          />
                          {a.status === 'draft' && (
                            <p className="mt-1 text-[11px] text-faint">Publish first</p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-0.5">
                            {wizardEditable ? (
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Edit ${a.name}`}
                                title="Edit"
                                onClick={() => setWizard({ existing: a })}
                              >
                                <Pencil />
                              </Button>
                            ) : (
                              <Button size="icon-sm" variant="ghost" asChild>
                                <Link
                                  href={`/admin/automations/${a.id}`}
                                  aria-label={`Open ${a.name} in the visual editor`}
                                  title="Open visual editor"
                                >
                                  <Pencil />
                                </Link>
                              </Button>
                            )}
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Run history for ${a.name}`}
                              title="Run history"
                              onClick={() => setRunsOf(a)}
                            >
                              <History />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={`More actions for ${a.name}`}
                                >
                                  <MoreHorizontal />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {(a.status === 'draft' || a.has_unpublished_changes) && (
                                  <DropdownMenuItem onSelect={() => setToPublish(a)}>
                                    <Upload /> Publish…
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onSelect={() => setTestOf(a)}>
                                  <Play /> Test (dry run)…
                                </DropdownMenuItem>
                                {a.editor_mode === 'wizard' && wizardEditable && (
                                  <DropdownMenuItem asChild>
                                    <Link href={`/admin/automations/${a.id}`}>
                                      Open in visual editor
                                    </Link>
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onSelect={() =>
                                    duplicate.mutate(a.id, {
                                      onSuccess: () => toast.success('Duplicated as a draft'),
                                      onError: (e) => toast.error(friendlyMessage(e)),
                                    })
                                  }
                                >
                                  <Copy /> Duplicate
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem destructive onSelect={() => setToArchive(a)}>
                                  <Archive /> Archive…
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PaginationBar
              total={list.data.total}
              limit={PAGE}
              offset={offset}
              count={list.data.items.length}
              onOffsetChange={setOffset}
            />
          </>
        )}
      </Panel>

      <WorkflowWizard
        open={!!wizard}
        onOpenChange={(o) => !o && setWizard(null)}
        existing={wizard?.existing ?? null}
      />
      <RunsDialog
        automationId={runsOf?.id ?? null}
        name={runsOf?.name ?? ''}
        onClose={() => setRunsOf(null)}
      />
      <TestDialog automation={testOf} onClose={() => setTestOf(null)} />
      <PublishDialog automation={toPublish} onClose={() => setToPublish(null)} />
      <ConfirmDialog
        open={!!toArchive}
        onOpenChange={(o) => !o && setToArchive(null)}
        title={`Archive “${toArchive?.name}”?`}
        description="It stops running and leaves this list. Its run history and audit trail are kept."
        confirmLabel="Archive"
        destructive
        pending={archive.isPending}
        onConfirm={() =>
          archive.mutate(toArchive!.id, {
            onSuccess: () => (toast.success('Workflow archived'), setToArchive(null)),
            onError: (e) => (toast.error(friendlyMessage(e)), setToArchive(null)),
          })
        }
      />
      <ConfirmDialog
        open={!!toEnable}
        onOpenChange={(o) => !o && setToEnable(null)}
        title={`Enable “${toEnable?.name}”?`}
        description="This workflow contains high-risk steps (delete, access changes or email). Each run acts as the person who published it."
        confirmLabel="Enable"
        pending={enable.isPending}
        onConfirm={() => {
          toggle(toEnable!, true);
          setToEnable(null);
        }}
      />
    </>
  );
}
