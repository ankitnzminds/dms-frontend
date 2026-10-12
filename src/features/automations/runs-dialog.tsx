'use client';

import { Loader2, RotateCcw, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent } from '@/components/ui/dialog';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { friendlyMessage } from '@/lib/api-client';
import { formatDateTime, titleCase } from '@/lib/format';
import { useCancelRun, useRetryRun, useRun, useRuns, type Run } from './api';

export const RUN_TONE = {
  succeeded: 'ok',
  running: 'info',
  queued: 'info',
  waiting: 'warn',
  failed: 'danger',
  cancelled: 'neutral',
  skipped: 'neutral',
  pending: 'neutral',
} as const;

export function RunDetail({ id }: { id: string }) {
  const q = useRun(id);
  const retry = useRetryRun();
  const cancel = useCancelRun();
  if (q.isPending) return <SkeletonRows rows={3} label="Loading run" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const run = q.data;
  const act = (kind: 'retry' | 'cancel') =>
    (kind === 'retry' ? retry : cancel).mutate(id, {
      onSuccess: () =>
        toast.success(kind === 'retry' ? 'Retrying the failed steps' : 'Run cancelled'),
      onError: (e) => toast.error(friendlyMessage(e)),
    });
  return (
    <div className="grid gap-2 border-t border-line bg-surface-2/40 px-3 py-3 text-xs">
      <p className="text-muted">
        Run <code>{run.id.slice(0, 8)}</code> · version {run.version_number ?? '—'} · correlation{' '}
        <code>{run.correlation_id}</code>
        {run.mode === 'dry' && ' · dry run (nothing was changed)'}
      </p>
      {run.error && <p className="text-danger">{run.error}</p>}
      <ol className="grid gap-1.5">
        {run.nodes.map((n) => (
          <li key={n.node_id} className="rounded-md border border-line bg-surface px-2.5 py-1.5">
            <p className="flex flex-wrap items-center gap-2">
              <strong>{n.label}</strong>
              <Badge tone={RUN_TONE[n.status] ?? 'neutral'}>{n.status}</Badge>
              {typeof n.output?.branch === 'string' && (
                <Badge tone="outline">exit: {titleCase(n.output.branch)}</Badge>
              )}
              <span className="text-muted">attempt {n.attempts}</span>
            </p>
            {n.error && <p className="text-danger">{n.error}</p>}
            {Object.keys(n.output ?? {}).length > 0 && (
              <p className="break-words text-muted">{JSON.stringify(n.output)}</p>
            )}
          </li>
        ))}
        {run.nodes.length === 0 && <li className="text-muted">No step has run yet.</li>}
      </ol>
      <div className="flex gap-2">
        {run.status === 'failed' && run.mode === 'live' && (
          <Button size="sm" onClick={() => act('retry')} disabled={retry.isPending}>
            {retry.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />} Retry failed
            steps
          </Button>
        )}
        {['queued', 'waiting', 'running'].includes(run.status) && (
          <Button
            size="sm"
            variant="danger-ghost"
            onClick={() => act('cancel')}
            disabled={cancel.isPending}
          >
            <XCircle /> Cancel run
          </Button>
        )}
      </div>
    </div>
  );
}

function RunRow({ run, open, onToggle }: { run: Run; open: boolean; onToggle: () => void }) {
  return (
    <li className="border-b border-line last:border-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-[13px] hover:bg-surface-2"
      >
        <Badge tone={RUN_TONE[run.status]}>{run.status}</Badge>
        <span>{formatDateTime(run.created_at)}</span>
        {run.mode === 'dry' && <Badge tone="outline">dry run</Badge>}
        <span className="truncate text-xs text-muted">
          {(run.trigger_context as { resource?: { name?: string } }).resource?.name ??
            titleCase(String((run.trigger_context as { event?: string }).event ?? 'run'))}
        </span>
        {run.error && <span className="truncate text-xs text-danger">{run.error}</span>}
      </button>
      {open && <RunDetail id={run.id} />}
    </li>
  );
}

/** Run history of one workflow, with node outcomes, retry and cancel. */
export function RunsDialog(props: {
  automationId: string | null;
  name: string;
  onClose: () => void;
}) {
  // remounted per workflow, so page 2 of one workflow never carries over to the next
  return <RunsDialogInner key={props.automationId ?? 'closed'} {...props} />;
}

function RunsDialogInner({
  automationId,
  name,
  onClose,
}: {
  automationId: string | null;
  name: string;
  onClose: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useRuns(automationId ?? undefined, offset);
  return (
    <Dialog open={!!automationId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-2xl"
        title={`Run history: ${name}`}
        description="Every run is a durable record with its step outcomes."
      >
        <DialogBody className="p-0">
          {q.isPending ? (
            <SkeletonRows rows={4} label="Loading runs" />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          ) : q.data.items.length === 0 ? (
            <EmptyState
              title="No runs yet"
              description="Runs appear here when the condition fires."
            />
          ) : (
            <>
              <ul>
                {q.data.items.map((r) => (
                  <RunRow
                    key={r.id}
                    run={r}
                    open={openId === r.id}
                    onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                  />
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-muted">
                <span>
                  {offset + 1}–{offset + q.data.items.length} of {q.data.total}
                </span>
                <span className="flex gap-1">
                  <Button
                    size="sm"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - 20))}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    disabled={offset + 20 >= q.data.total}
                    onClick={() => setOffset(offset + 20)}
                  >
                    Next
                  </Button>
                </span>
              </div>
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
