'use client';

import {
  CheckCircle2,
  CircleDashed,
  Clock,
  Loader2,
  MinusCircle,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { RunSummary } from '@/features/automations/api';
import { formatDateTime, formatRelative, titleCase } from '@/lib/format';
import { cn } from '@/lib/utils';

type Status = RunSummary['status'];
type StepStatus = RunSummary['steps'][number]['status'];

const RUN_TONE: Record<Status, 'ok' | 'info' | 'warn' | 'danger' | 'neutral'> = {
  succeeded: 'ok',
  running: 'info',
  queued: 'info',
  waiting: 'warn',
  failed: 'danger',
  cancelled: 'neutral',
  skipped: 'neutral',
};

const RUN_LABEL: Record<Status, string> = {
  succeeded: 'Done',
  running: 'Running',
  queued: 'Starting',
  waiting: 'Waiting for a person',
  failed: 'Failed',
  cancelled: 'Cancelled',
  skipped: 'Nothing to do',
};

const STEP_ICON: Record<StepStatus, { icon: LucideIcon; tone: string; spin?: boolean }> = {
  succeeded: { icon: CheckCircle2, tone: 'text-ok' },
  running: { icon: Loader2, tone: 'text-info', spin: true },
  waiting: { icon: Clock, tone: 'text-warn' },
  failed: { icon: XCircle, tone: 'text-danger' },
  skipped: { icon: MinusCircle, tone: 'text-muted' },
  pending: { icon: CircleDashed, tone: 'text-faint' },
};

const EXIT_TEXT: Record<string, string> = {
  approved: 'Approved',
  rejected: 'Rejected',
  timeout: 'Timed out',
  true: 'Yes',
  false: 'No',
};

export const runStatusLabel = (s: Status) => RUN_LABEL[s] ?? titleCase(s);

/** What a workflow did, step by step, in plain words (no parameters, no raw output). */
export function StepTimeline({ steps }: { steps: RunSummary['steps'] }) {
  if (steps.length === 0) return <p className="text-xs text-muted">No step has started yet.</p>;
  return (
    <ol aria-label="Steps" className="grid gap-0">
      {steps.map((s, i) => {
        const { icon: Icon, tone, spin } = STEP_ICON[s.status] ?? STEP_ICON.pending;
        return (
          <li key={i} className="relative flex gap-2.5 pb-3 last:pb-0">
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className="absolute left-[9px] top-5 h-[calc(100%-1rem)] w-px bg-line"
              />
            )}
            <Icon
              className={cn('mt-0.5 size-[18px] shrink-0 bg-surface', tone, spin && 'animate-spin')}
              aria-hidden
            />
            <div className="min-w-0 text-[13px]">
              <p className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{s.label}</span>
                <span className="sr-only">{titleCase(s.status)}</span>
                {s.branch && (
                  <Badge tone="outline">{EXIT_TEXT[s.branch] ?? titleCase(s.branch)}</Badge>
                )}
                {s.status === 'waiting' && <Badge tone="warn">Waiting</Badge>}
              </p>
              {s.error && <p className="text-xs text-danger">{s.error}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function WorkflowRunCard({
  run,
  showItem = true,
  className,
}: {
  run: RunSummary;
  /** Show which file or folder the run is about (hide it on that item's own page). */
  showItem?: boolean;
  className?: string;
}) {
  const href =
    run.resource_id && run.resource_type === 'document'
      ? `/documents/${run.resource_id}`
      : run.resource_id && run.resource_type === 'folder'
        ? `/files/${run.resource_id}`
        : null;
  return (
    <article
      className={cn('rounded-lg border border-line bg-surface p-3', className)}
      data-testid="workflow-run"
      data-status={run.status}
      aria-label={`${run.automation_name}: ${runStatusLabel(run.status)}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{run.automation_name}</h3>
        <Badge tone={RUN_TONE[run.status] ?? 'neutral'}>{runStatusLabel(run.status)}</Badge>
        <span className="text-xs text-muted" title={formatDateTime(run.created_at)}>
          {run.started_by_email ? `started by ${run.started_by_email} · ` : ''}
          {formatRelative(run.created_at)}
        </span>
      </header>
      {showItem && run.resource_name && (
        <p className="mt-0.5 text-xs">
          {href ? (
            <Link href={href} className="text-accent hover:underline">
              {run.resource_name}
            </Link>
          ) : (
            run.resource_name
          )}
        </p>
      )}
      {run.note && <p className="mt-1 text-xs italic text-muted">“{run.note}”</p>}
      {run.error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {run.error}
        </p>
      )}
      <div className="mt-3">
        <StepTimeline steps={run.steps} />
      </div>
      {run.status === 'waiting' && (
        <p className="mt-2 text-xs text-muted">
          Waiting for a decision. The people asked can answer under{' '}
          <Link href="/approvals" className="text-accent hover:underline">
            My approvals
          </Link>
          .
        </p>
      )}
    </article>
  );
}
