'use client';

import { Activity, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { PaginationBar } from '@/components/file-browser/pagination-bar';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Field, Select } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useAllRuns, useAutomations, type RunStatus } from '@/features/automations/api';
import { RUN_TONE, RunDetail } from '@/features/automations/runs-dialog';
import { formatDateTime, formatRelative, titleCase } from '@/lib/format';
import { cn } from '@/lib/utils';

const PAGE = 25;
const STATUSES: RunStatus[] = ['waiting', 'running', 'queued', 'failed', 'succeeded', 'cancelled'];

/** Every live workflow run in the organization: what is waiting on a person, what failed, what finished. */
export function WorkflowRunsView() {
  const [status, setStatus] = useState<RunStatus | ''>('');
  const [automationId, setAutomationId] = useState('');
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const flows = useAutomations({ q: '', limit: 100, offset: 0 });
  const q = useAllRuns({ status, automationId, offset });

  return (
    <>
      <PageHeader
        title="Workflow runs"
        description="Every run of every workflow, newest first. Open a run to see each step, retry what failed or cancel it."
      />
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field id="runs-status" label="Status">
          {(p) => (
            <Select
              {...p}
              className="w-44"
              value={status}
              onChange={(e) => (setStatus(e.target.value as RunStatus | ''), setOffset(0))}
            >
              <option value="">Any</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="runs-flow" label="Workflow">
          {(p) => (
            <Select
              {...p}
              className="w-64"
              value={automationId}
              onChange={(e) => (setAutomationId(e.target.value), setOffset(0))}
            >
              <option value="">All workflows</option>
              {flows.data?.items.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Panel>
        {q.isPending ? (
          <SkeletonRows rows={5} label="Loading runs" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No runs match"
            description="Runs appear when a workflow starts, by an event, a schedule or a person."
          />
        ) : (
          <>
            <ul aria-label="Workflow runs">
              {q.data.items.map((r) => {
                const ctx = (r.trigger_context ?? {}) as {
                  resource?: { name?: string };
                  event?: string;
                };
                const isOpen = open === r.id;
                return (
                  <li
                    key={r.id}
                    className="border-b border-line last:border-0"
                    data-testid="run-row"
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : r.id)}
                      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left text-[13px] hover:bg-surface-2"
                    >
                      <ChevronRight
                        className={cn(
                          'size-4 shrink-0 text-muted transition-transform',
                          isOpen && 'rotate-90',
                        )}
                        aria-hidden
                      />
                      <Badge tone={RUN_TONE[r.status] ?? 'neutral'}>{r.status}</Badge>
                      <span className="font-medium">{r.automation_name ?? 'Workflow'}</span>
                      <span className="truncate text-xs text-muted">
                        {ctx.resource?.name ?? titleCase(ctx.event ?? 'run')}
                      </span>
                      {r.event_key.startsWith('manual:') && (
                        <Badge tone="outline">Started by a person</Badge>
                      )}
                      <span className="flex-1" />
                      <span className="text-xs text-muted" title={formatDateTime(r.created_at)}>
                        {formatRelative(r.created_at)}
                      </span>
                    </button>
                    {isOpen && <RunDetail id={r.id} />}
                  </li>
                );
              })}
            </ul>
            <PaginationBar
              total={q.data.total}
              limit={PAGE}
              offset={offset}
              count={q.data.items.length}
              onOffsetChange={setOffset}
            />
          </>
        )}
      </Panel>
    </>
  );
}
