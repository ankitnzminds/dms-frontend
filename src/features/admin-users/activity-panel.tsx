'use client';

import { Download, Loader2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { friendlyMessage } from '@/lib/api-client';
import { formatDateTime, titleCase } from '@/lib/format';
import {
  downloadBlob,
  exportActivity,
  useActivity,
  useAuditPolicy,
  type ActivityEvent,
  type ActivityFilters,
} from './api';

const OUTCOME_TONE = { success: 'ok', denied: 'warn', failure: 'danger' } as const;

/** "document.office_opened" -> "Office opened". */
export function actionLabel(action: string): string {
  const rest = action.includes('.') ? action.slice(action.indexOf('.') + 1) : action;
  return titleCase(rest);
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-1.5 text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function EventDialog({ event, onClose }: { event: ActivityEvent | null; onClose: () => void }) {
  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={event ? actionLabel(event.action) : 'Event'}
        description={event?.action}
      >
        {event && (
          <DialogBody>
            <dl className="divide-y divide-line">
              <Detail label="Time">
                {formatDateTime(event.occurred_at)} (local time; stored in UTC)
              </Detail>
              <Detail label="Category">{titleCase(event.category)}</Detail>
              <Detail label="Result">
                <Badge tone={OUTCOME_TONE[event.outcome]}>{event.outcome}</Badge>
              </Detail>
              <Detail label="Actor">{event.actor_email ?? event.actor_user_id ?? 'System'}</Detail>
              <Detail label="Target">
                {event.target_type
                  ? `${event.target_type}: ${event.target_label ?? event.target_id ?? ''}`
                  : '-'}
              </Detail>
              <Detail label="Request ID">{event.request_id ?? '-'}</Detail>
              {(event.ip_address || event.user_agent) && (
                <>
                  <Detail label="IP address">{event.ip_address ?? '-'}</Detail>
                  <Detail label="Client">{event.user_agent ?? '-'}</Detail>
                </>
              )}
              <Detail label="Details">
                {Object.keys(event.metadata).length === 0 ? (
                  '-'
                ) : (
                  <pre className="whitespace-pre-wrap rounded-md bg-surface-2 p-2 text-xs">
                    {JSON.stringify(event.metadata, null, 2)}
                  </pre>
                )}
              </Detail>
            </dl>
          </DialogBody>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Activity timeline from the append-only audit log. Used inside user details (scoped to that user)
 * and on the organization Activity page. Query failures are shown as errors, never as "no activity".
 */
export function ActivityPanel({ userId, compact }: { userId?: string; compact?: boolean }) {
  const [draft, setDraft] = useState({
    category: '',
    outcome: '',
    action: '',
    since: '',
    until: '',
  });
  const [applied, setApplied] = useState(draft);
  const [open, setOpen] = useState<ActivityEvent | null>(null);
  const [exporting, setExporting] = useState(false);
  const policy = useAuditPolicy();

  const filters: ActivityFilters = {
    userId,
    category: applied.category || undefined,
    outcome: (applied.outcome || undefined) as ActivityFilters['outcome'],
    action: applied.action || undefined,
    since: applied.since ? new Date(`${applied.since}T00:00:00`).toISOString() : undefined,
    until: applied.until ? new Date(`${applied.until}T23:59:59`).toISOString() : undefined,
  };
  const q = useActivity(filters);
  const events = q.data?.pages.flatMap((p) => p.items) ?? [];
  const set =
    (k: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft((d) => ({ ...d, [k]: e.target.value }));

  async function download() {
    setExporting(true);
    try {
      downloadBlob(await exportActivity(filters), 'activity.csv');
      toast.success('Activity export downloaded (this export is itself recorded)');
    } catch (e) {
      toast.error(friendlyMessage(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="grid gap-3">
      <form
        className={`grid gap-2 ${compact ? 'sm:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-5'}`}
        aria-label="Activity filters"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(draft);
        }}
      >
        <Field id={`act-cat-${userId ?? 'all'}`} label="Category">
          {(p) => (
            <Select {...p} value={draft.category} onChange={set('category')}>
              <option value="">All categories</option>
              {policy.data?.categories.map((c) => (
                <option key={c} value={c}>
                  {titleCase(c)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id={`act-out-${userId ?? 'all'}`} label="Result">
          {(p) => (
            <Select {...p} value={draft.outcome} onChange={set('outcome')}>
              <option value="">Any result</option>
              <option value="success">Success</option>
              <option value="denied">Denied</option>
              <option value="failure">Failure</option>
            </Select>
          )}
        </Field>
        <Field id={`act-act-${userId ?? 'all'}`} label="Action" hint="e.g. share.created">
          {(p) => <Input {...p} value={draft.action} onChange={set('action')} />}
        </Field>
        <Field id={`act-from-${userId ?? 'all'}`} label="From (local date)">
          {(p) => <Input {...p} type="date" value={draft.since} onChange={set('since')} />}
        </Field>
        <Field id={`act-to-${userId ?? 'all'}`} label="To (local date)">
          {(p) => <Input {...p} type="date" value={draft.until} onChange={set('until')} />}
        </Field>
        <div className="flex items-end gap-2 sm:col-span-full">
          <Button type="submit" variant="primary">
            Apply filters
          </Button>
          <Button
            onClick={() => {
              const empty = { category: '', outcome: '', action: '', since: '', until: '' };
              setDraft(empty);
              setApplied(empty);
            }}
          >
            Reset
          </Button>
          <span className="flex-1" />
          <Button onClick={download} disabled={exporting || q.isError}>
            {exporting ? <Loader2 className="animate-spin" aria-hidden /> : <Download />} Export CSV
          </Button>
        </div>
      </form>

      {policy.data && (
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Append-only. Never recorded: {policy.data.never_recorded.join('; ')}.{' '}
            {policy.data.coverage_note}
          </span>
        </p>
      )}

      {q.isPending ? (
        <SkeletonRows rows={5} label="Loading activity" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : events.length === 0 ? (
        <EmptyState
          title="No activity matches"
          description="No recorded events for these filters."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-line" tabIndex={0}>
          <table className="w-full min-w-[34rem] border-collapse text-[13px]">
            <caption className="sr-only">Activity events, newest first</caption>
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left text-xs text-muted">
                <th scope="col" className="px-3 py-2 font-medium">
                  When
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Event
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Who
                </th>
                <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">
                  Target
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Result
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr
                  key={e.id}
                  tabIndex={0}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2 focus-visible:bg-surface-2"
                  onClick={() => setOpen(e)}
                  onKeyDown={(ev) => ev.key === 'Enter' && setOpen(e)}
                  data-testid="activity-row"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-muted">
                    {formatDateTime(e.occurred_at)}
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{actionLabel(e.action)}</p>
                    <p className="text-xs text-muted">{titleCase(e.category)}</p>
                  </td>
                  <td className="px-3 py-2">{e.actor_email ?? 'System'}</td>
                  <td className="hidden px-3 py-2 text-muted md:table-cell">
                    {e.target_label ?? e.target_type ?? '-'}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={OUTCOME_TONE[e.outcome]}>{e.outcome}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q.hasNextPage && (
        <div className="flex justify-center">
          <Button onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage}>
            {q.isFetchingNextPage && <Loader2 className="animate-spin" aria-hidden />} Load older
            events
          </Button>
        </div>
      )}
      <EventDialog event={open} onClose={() => setOpen(null)} />
    </div>
  );
}
