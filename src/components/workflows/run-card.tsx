'use client';

import {
  Ban,
  CheckCircle2,
  Circle,
  CircleDot,
  Loader2,
  MinusCircle,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Textarea } from '@/components/ui/input';
import { useCancelRun, useResubmitRun, type Run } from '@/features/workflows/hooks';
import { friendlyMessage } from '@/lib/api-client';
import { formatDateTime, titleCase } from '@/lib/format';

const RUN_TONE = {
  in_progress: 'info',
  approved: 'ok',
  rejected: 'danger',
  cancelled: 'neutral',
} as const;
const RUN_LABEL = {
  in_progress: 'In review',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
} as const;

function StepIcon({ status }: { status: Run['steps'][number]['status'] }) {
  const c = 'size-4 shrink-0';
  if (status === 'approved') return <CheckCircle2 className={`${c} text-ok`} aria-hidden />;
  if (status === 'rejected') return <XCircle className={`${c} text-danger`} aria-hidden />;
  if (status === 'active') return <CircleDot className={`${c} text-accent`} aria-hidden />;
  if (status === 'skipped') return <MinusCircle className={`${c} text-faint`} aria-hidden />;
  return <Circle className={`${c} text-faint`} aria-hidden />;
}

/** One approval run: steps, tasks, and the action history. Pure display + cancel/resubmit. */
export function RunCard({ run, canManage }: { run: Run; canManage: boolean }) {
  const cancel = useCancelRun();
  const resubmit = useResubmitRun();
  const [confirm, setConfirm] = useState(false);
  const [comment, setComment] = useState('');
  const open = run.state === 'in_progress';

  return (
    <article
      className="rounded-lg border border-line bg-surface p-4"
      aria-label={`Approval run ${run.definition_name ?? ''}`}
      data-testid="run-card"
      data-state={run.state}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{run.definition_name ?? 'Approval'}</h3>
        <Badge tone={RUN_TONE[run.state]}>{RUN_LABEL[run.state]}</Badge>
        <span className="text-xs text-muted">
          v{run.definition_version} · document version {run.document_version_number} · started by{' '}
          {run.started_by.display_name ?? run.started_by.email} {formatDateTime(run.created_at)}
        </span>
        <span className="ml-auto flex gap-1.5">
          {canManage && open && (
            <Button size="sm" variant="danger-ghost" onClick={() => setConfirm(true)}>
              <Ban /> Cancel run
            </Button>
          )}
          {canManage && (run.state === 'rejected' || run.state === 'cancelled') && (
            <Button
              size="sm"
              disabled={resubmit.isPending}
              onClick={() =>
                resubmit.mutate(
                  { id: run.id },
                  {
                    onSuccess: () => toast.success('Resubmitted for approval'),
                    onError: (e) => toast.error(friendlyMessage(e)),
                  },
                )
              }
            >
              {resubmit.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />} Resubmit
            </Button>
          )}
        </span>
      </header>
      {run.note && <p className="mt-1 text-xs italic text-muted">“{run.note}”</p>}
      {run.outcome_comment && (
        <p className="mt-1 text-xs text-muted">Outcome: {run.outcome_comment}</p>
      )}

      <ol className="mt-3 grid gap-2" aria-label="Steps">
        {run.steps.map((s) => {
          const tasks = run.tasks.filter((t) => t.step_index === s.index);
          return (
            <li
              key={s.index}
              className="rounded-md border border-line px-3 py-2"
              data-step-status={s.status}
            >
              <p className="flex items-center gap-2 text-[13px] font-medium">
                <StepIcon status={s.status} /> {s.name}{' '}
                <span className="text-xs font-normal text-muted">
                  ({s.rule === 'all' ? 'everyone must approve' : 'any one approver'}) ·{' '}
                  {titleCase(s.status)}
                </span>
              </p>
              {tasks.length > 0 && (
                <ul className="mt-1.5 grid gap-1 pl-6">
                  {tasks.map((t) => (
                    <li
                      key={t.id}
                      className="text-xs"
                      data-testid="run-task"
                      data-status={t.status}
                    >
                      <span className="font-medium">
                        {t.assignee.display_name ?? t.assignee.email}
                      </span>{' '}
                      - {titleCase(t.status)}
                      {t.delegated_from &&
                        ` (delegated from ${t.delegated_from.display_name ?? t.delegated_from.email})`}
                      {t.due_at && t.status === 'pending' && (
                        <span className={t.overdue ? 'text-danger' : 'text-muted'}>
                          {' '}
                          · due {formatDateTime(t.due_at)}
                          {t.overdue && ' (overdue)'}
                        </span>
                      )}
                      {t.comment && <span className="text-muted"> · “{t.comment}”</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      {run.actions.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-muted">History ({run.actions.length})</summary>
          <ul className="mt-1.5 grid gap-1">
            {run.actions.map((a) => (
              <li key={a.id}>
                <span className="text-muted">{formatDateTime(a.created_at)}</span> ·{' '}
                {a.actor ? (a.actor.display_name ?? a.actor.email) : 'System'} ·{' '}
                {titleCase(a.action)}
                {a.comment && ` - “${a.comment}”`}
              </li>
            ))}
          </ul>
        </details>
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Cancel this approval?"
        description="Reviewers lose access to the document and pending tasks are closed. You can resubmit later."
        confirmLabel="Cancel approval"
        destructive
        pending={cancel.isPending}
        onConfirm={() =>
          cancel.mutate(
            { id: run.id, comment: comment.trim() || undefined },
            {
              onSuccess: () => {
                toast.success('Approval cancelled');
                setConfirm(false);
              },
              onError: (e) => {
                toast.error(friendlyMessage(e));
                setConfirm(false);
              },
            },
          )
        }
      >
        <Textarea
          aria-label="Reason (optional)"
          placeholder="Reason (optional)"
          className="mt-3 min-h-16"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </ConfirmDialog>
    </article>
  );
}
