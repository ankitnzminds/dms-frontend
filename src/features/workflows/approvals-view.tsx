'use client';

import { CheckCheck, ClipboardCheck, Loader2, UserRoundPlus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { PaginationBar } from '@/components/file-browser/pagination-bar';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { MemberPicker } from '@/features/members/member-picker';
import { friendlyMessage, isApiError, type UserRef } from '@/lib/api-client';
import { formatDateTime, titleCase } from '@/lib/format';
import { useDecideTask, useDelegateTask, useMyTasks, type Task } from './hooks';

const PAGE = 25;

const TASK_ERR: Record<string, string> = {
  task_closed: 'This task was already closed.',
  already_responded: 'You already responded to this task.',
  run_closed: 'This approval is no longer open.',
  invalid_delegate: 'That person cannot take this task.',
};
const taskError = (e: unknown) =>
  isApiError(e) && TASK_ERR[e.code] ? TASK_ERR[e.code]! : friendlyMessage(e);

function DecisionDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const decide = useDecideTask();
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Decide on "${task.document_name}"`}
        description={`${task.step_name} - version ${task.document_version_number ?? ''}`}
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            decide.mutate(
              { id: task.id, decision, comment: comment.trim() },
              {
                onSuccess: () => {
                  toast.success(decision === 'approve' ? 'Approved' : 'Rejected');
                  onClose();
                },
                onError: (er) => setError(taskError(er)),
              },
            );
          }}
        >
          <DialogBody className="grid gap-3">
            <Field id="dec" label="Decision">
              {(p) => (
                <Select
                  {...p}
                  value={decision}
                  onChange={(e) => setDecision(e.target.value as 'approve' | 'reject')}
                >
                  <option value="approve">Approve</option>
                  <option value="reject">Reject</option>
                </Select>
              )}
            </Field>
            <Field id="dec-comment" label="Comment (optional)">
              {(p) => (
                <Textarea
                  {...p}
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              )}
            </Field>
            {error && (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={decision === 'reject' ? 'danger' : 'primary'}
              disabled={decide.isPending}
            >
              {decide.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {decision === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DelegateDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const delegate = useDelegateTask();
  const [user, setUser] = useState<UserRef | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Delegate "${task.document_name}"`}
        description="The person you choose gets access to this document and decides instead of you."
      >
        <DialogBody className="grid gap-3">
          <MemberPicker label="Delegate to" inputId="delegate-to" onSelect={setUser} />
          {user && (
            <p className="text-[13px]" data-testid="delegate-picked">
              Selected: <strong>{user.display_name ?? user.email}</strong>
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!user || delegate.isPending}
            onClick={() =>
              delegate.mutate(
                { id: task.id, userId: user!.id },
                {
                  onSuccess: () => {
                    toast.success(`Delegated to ${user!.display_name ?? user!.email}`);
                    onClose();
                  },
                  onError: (er) => setError(taskError(er)),
                },
              )
            }
          >
            Delegate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUSES = ['pending', 'approved', 'rejected', 'cancelled', 'skipped'] as const;

export function ApprovalsView() {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('pending');
  const [offset, setOffset] = useState(0);
  const q = useMyTasks(status, PAGE, offset);
  const [deciding, setDeciding] = useState<Task | null>(null);
  const [delegating, setDelegating] = useState<Task | null>(null);

  return (
    <>
      <PageHeader
        title="My approvals"
        description="Documents waiting for your decision. You can open only the document itself while a task is pending."
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="task-status" className="text-[13px]">
              Show
            </label>
            <Select
              id="task-status"
              className="w-36"
              value={status}
              onChange={(e) => (setStatus(e.target.value as typeof status), setOffset(0))}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </Select>
          </div>
        }
      />
      <Panel>
        {q.isPending ? (
          <SkeletonRows rows={4} label="Loading approvals" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title={status === 'pending' ? 'Nothing is waiting for you' : `No ${status} tasks`}
            description="When someone submits a document that needs your review, it appears here."
          />
        ) : (
          <>
            <ul className="divide-y divide-line" aria-label="Approval tasks">
              {q.data.items.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-start gap-3 px-4 py-3"
                  data-testid="task-row"
                  data-status={t.status}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                      <Link
                        className="hover:text-accent hover:underline"
                        href={`/documents/${t.document_id}`}
                      >
                        {t.document_name ?? 'Document'}
                      </Link>
                      <Badge
                        tone={
                          t.status === 'pending'
                            ? 'info'
                            : t.status === 'approved'
                              ? 'ok'
                              : t.status === 'rejected'
                                ? 'danger'
                                : 'neutral'
                        }
                      >
                        {titleCase(t.status)}
                      </Badge>
                      {t.overdue && <Badge tone="danger">Overdue</Badge>}
                    </p>
                    <p className="text-xs text-muted">
                      {t.step_name} · requested by{' '}
                      {t.started_by?.display_name ?? t.started_by?.email ?? 'someone'}
                      {t.due_at && ` · due ${formatDateTime(t.due_at)}`}
                    </p>
                    {t.note && <p className="text-xs italic text-muted">“{t.note}”</p>}
                    <p className="text-xs">
                      <Link
                        className="text-accent hover:underline"
                        href={`/approvals/runs/${t.run_id}`}
                      >
                        View approval progress
                      </Link>
                    </p>
                  </div>
                  {t.status === 'pending' && (
                    <span className="flex gap-1.5">
                      <Button size="sm" variant="primary" onClick={() => setDeciding(t)}>
                        <CheckCheck /> Decide
                      </Button>
                      <Button size="sm" onClick={() => setDelegating(t)}>
                        <UserRoundPlus /> Delegate
                      </Button>
                    </span>
                  )}
                </li>
              ))}
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
      {deciding && <DecisionDialog task={deciding} onClose={() => setDeciding(null)} />}
      {delegating && <DelegateDialog task={delegating} onClose={() => setDelegating(null)} />}
    </>
  );
}
