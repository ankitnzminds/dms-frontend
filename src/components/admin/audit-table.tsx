'use client';

import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { PaginationBar } from '@/components/file-browser/pagination-bar';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import type { AuditEvent, Page } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export function OutcomeBadge({ outcome }: { outcome: AuditEvent['outcome'] }) {
  return (
    <Badge tone={outcome === 'success' ? 'ok' : outcome === 'denied' ? 'warn' : 'danger'}>
      {outcome}
    </Badge>
  );
}

function Row({ e }: { e: AuditEvent }) {
  const [open, setOpen] = useState(false);
  const hasMeta = e.metadata && Object.keys(e.metadata).length > 0;
  return (
    <>
      <tr
        className="border-b border-line align-top last:border-0"
        data-testid="audit-row"
        data-action={e.action}
      >
        <td className="px-3 py-2">
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} details for ${e.action}`}
            onClick={() => setOpen((o) => !o)}
            className="rounded-sm p-0.5 text-muted hover:text-text"
          >
            <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
          </button>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-muted">{formatDateTime(e.created_at)}</td>
        <td className="px-3 py-2 font-mono text-xs font-medium">{e.action}</td>
        <td className="hidden px-3 py-2 sm:table-cell">
          {e.actor_email ?? <span className="text-faint">system</span>}
        </td>
        <td className="hidden px-3 py-2 text-muted md:table-cell">
          {e.resource_type ?? '-'}
          {e.resource_id && (
            <span className="ml-1.5 font-mono text-xs text-faint" title={e.resource_id}>
              {e.resource_id.slice(0, 8)}
            </span>
          )}
        </td>
        <td className="px-3 py-2">
          <OutcomeBadge outcome={e.outcome} />
        </td>
      </tr>
      {open && (
        <tr className="border-b border-line bg-surface-2">
          <td />
          <td colSpan={5} className="px-3 py-2">
            <dl className="mb-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              <dt className="text-muted">resource_id</dt>
              <dd className="break-all font-mono">{e.resource_id ?? '-'}</dd>
              <dt className="text-muted">actor_user_id</dt>
              <dd className="break-all font-mono">{e.actor_user_id ?? '-'}</dd>
              <dt className="text-muted">request_id</dt>
              <dd className="break-all font-mono">{e.request_id ?? '-'}</dd>
            </dl>
            {hasMeta ? (
              <pre className="scroll-thin max-h-60 overflow-auto rounded-md bg-surface p-2 text-xs">
                {JSON.stringify(e.metadata, null, 2)}
              </pre>
            ) : (
              <p className="text-xs text-muted">No additional metadata.</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export function AuditTable({
  data,
  isLoading,
  error,
  onRetry,
  onOffsetChange,
  emptyText = 'No audit events match these filters.',
  compact = false,
}: {
  data: Page<AuditEvent> | undefined;
  isLoading: boolean;
  error?: unknown;
  onRetry?: () => void;
  onOffsetChange: (o: number) => void;
  emptyText?: string;
  /** Hide pagination (embedded previews). */
  compact?: boolean;
}) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (isLoading || !data) return <SkeletonRows rows={6} label="Loading audit events" />;
  if (data.items.length === 0) return <EmptyState title="No events" description={emptyText} />;
  return (
    <div>
      <div className="overflow-x-auto" tabIndex={0}>
        <table className="w-full border-collapse text-[13px]">
          <caption className="sr-only">Audit events</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="w-8 px-3 py-2">
                <span className="sr-only">Details</span>
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Time
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Action
              </th>
              <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">
                Actor
              </th>
              <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">
                Resource
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Outcome
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((e) => (
              <Row key={e.id} e={e} />
            ))}
          </tbody>
        </table>
      </div>
      {!compact && (
        <PaginationBar
          total={data.total}
          limit={data.limit}
          offset={data.offset}
          count={data.items.length}
          onOffsetChange={onOffsetChange}
        />
      )}
    </div>
  );
}
