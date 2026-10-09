'use client';

import { Ban, Check, Inbox, X } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { friendlyMessage } from '@/lib/api-client';
import { formatDateTime, titleCase } from '@/lib/format';
import { actionLabel } from '@/lib/permissions';
import {
  accessRequestError,
  useAccessRequests,
  useCancelAccessRequest,
  useDecideAccessRequest,
  type AccessRequest,
  type RequestStatus,
} from './hooks';

const PAGE = 25;
const TONE = { pending: 'info', approved: 'ok', rejected: 'danger', cancelled: 'neutral' } as const;

function DecisionDialog({ req, onClose }: { req: AccessRequest; onClose: () => void }) {
  const decide = useDecideAccessRequest();
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Decide on the request for "${req.resource_name ?? 'an item'}"`}
        description={`${req.requester.display_name ?? req.requester.email} asked for: ${req.requested_actions.map(actionLabel).join(', ')}`}
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            decide.mutate(
              { id: req.id, body: { decision, reason: reason.trim() || null } },
              {
                onSuccess: () => {
                  toast.success(decision === 'approve' ? 'Request approved' : 'Request rejected');
                  onClose();
                },
                onError: (er) => setError(accessRequestError(er) ?? friendlyMessage(er)),
              },
            );
          }}
        >
          <DialogBody className="grid gap-3">
            <p className="rounded-md bg-surface-2 px-3 py-2 text-[13px]">“{req.reason}”</p>
            <Field id="dec-kind" label="Decision">
              {(p) => (
                <Select
                  {...p}
                  value={decision}
                  onChange={(e) => setDecision(e.target.value as typeof decision)}
                >
                  <option value="approve">Approve (grants the requested access)</option>
                  <option value="reject">Reject</option>
                </Select>
              )}
            </Field>
            <Field id="dec-reason" label="Reason (optional)">
              {(p) => (
                <Textarea
                  {...p}
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
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
              {decision === 'approve' ? <Check /> : <X />}{' '}
              {decision === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function List({ view }: { view: 'mine' | 'to_decide' }) {
  const [status, setStatus] = useState<RequestStatus | ''>(view === 'to_decide' ? 'pending' : '');
  const [offset, setOffset] = useState(0);
  const q = useAccessRequests(view, status, PAGE, offset);
  const cancel = useCancelAccessRequest();
  const [deciding, setDeciding] = useState<AccessRequest | null>(null);
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <label htmlFor={`rs-${view}`} className="text-[13px]">
          Status
        </label>
        <Select
          id={`rs-${view}`}
          className="w-40"
          value={status}
          onChange={(e) => (setStatus(e.target.value as RequestStatus | ''), setOffset(0))}
        >
          <option value="">Any</option>
          {(['pending', 'approved', 'rejected', 'cancelled'] as const).map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </Select>
      </div>
      <Panel>
        {q.isPending ? (
          <SkeletonRows rows={3} label="Loading requests" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={
              view === 'mine'
                ? 'You have not requested access to anything'
                : 'Nothing is waiting for your decision'
            }
            description={
              view === 'mine'
                ? 'Use "Request access" on an item you can see but cannot open.'
                : undefined
            }
          />
        ) : (
          <>
            <ul
              className="divide-y divide-line"
              aria-label={view === 'mine' ? 'My requests' : 'Requests to decide'}
            >
              {q.data.items.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-start gap-3 px-4 py-3"
                  data-testid="request-row"
                  data-status={r.status}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                      {r.resource_name ?? 'Item'}{' '}
                      <Badge tone={TONE[r.status]}>{titleCase(r.status)}</Badge>
                    </p>
                    <p className="text-xs text-muted">
                      {view === 'to_decide'
                        ? `From ${r.requester.display_name ?? r.requester.email} · `
                        : ''}
                      wants {r.requested_actions.map(actionLabel).join(', ')} ·{' '}
                      {formatDateTime(r.created_at)}
                    </p>
                    <p className="text-xs italic text-muted">“{r.reason}”</p>
                    {r.decided_at && (
                      <p className="text-xs text-muted">
                        Decided {formatDateTime(r.decided_at)}
                        {r.approver && ` by ${r.approver.display_name ?? r.approver.email}`}
                        {r.decision_reason && `: ${r.decision_reason}`}
                      </p>
                    )}
                    {r.status === 'approved' && r.resource_type === 'document' && (
                      <Link
                        className="text-xs text-accent hover:underline"
                        href={`/documents/${r.resource_id}`}
                      >
                        Open document
                      </Link>
                    )}
                  </div>
                  {r.status === 'pending' && r.can_decide && (
                    <Button size="sm" variant="primary" onClick={() => setDeciding(r)}>
                      Decide
                    </Button>
                  )}
                  {r.status === 'pending' && view === 'mine' && (
                    <Button
                      size="sm"
                      variant="danger-ghost"
                      disabled={cancel.isPending}
                      onClick={() =>
                        cancel.mutate(r.id, {
                          onSuccess: () => toast.success('Request cancelled'),
                          onError: (e) => toast.error(accessRequestError(e) ?? friendlyMessage(e)),
                        })
                      }
                    >
                      <Ban /> Cancel request
                    </Button>
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
      {deciding && <DecisionDialog req={deciding} onClose={() => setDeciding(null)} />}
    </>
  );
}

export function RequestsView() {
  return (
    <>
      <PageHeader
        title="Access requests"
        description="Ask for access to items you can see, and decide on requests sent to you."
      />
      <Tabs defaultValue="mine">
        <TabsList aria-label="Request lists">
          <TabsTrigger value="mine">My requests</TabsTrigger>
          <TabsTrigger value="to_decide">To approve</TabsTrigger>
        </TabsList>
        <TabsContent value="mine">
          <List view="mine" />
        </TabsContent>
        <TabsContent value="to_decide">
          <List view="to_decide" />
        </TabsContent>
      </Tabs>
    </>
  );
}
