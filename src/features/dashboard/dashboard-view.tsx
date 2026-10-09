'use client';

import { Bell, Clock, ShieldAlert, Share2 } from 'lucide-react';
import Link from 'next/link';
import { ItemIcon, StatusChip } from '@/components/file-browser/file-bits';
import { AuditTable } from '@/components/admin/audit-table';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { PathTrail } from '@/components/navigation/path-trail';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useAuditEvents } from '@/features/admin/hooks';
import { useMe } from '@/features/auth/session';
import { useOrgUsage, useRecent } from '@/features/files/hooks';
import { useNotifications } from '@/features/notifications/hooks';
import { useMyTasks } from '@/features/workflows/hooks';
import { useSignatureRequests } from '@/features/signatures/hooks';
import { useReceivedShares } from '@/features/sharing/hooks';
import { fmtCount, formatBytes, formatDate, formatRelative } from '@/lib/format';
import { isAdminRole } from '@/lib/permissions';
import { cn } from '@/lib/utils';

function StorageMeter({
  used,
  reserved,
  quota,
}: {
  used: number;
  reserved: number;
  quota: number | null;
}) {
  const pctUsed = quota ? Math.min(100, (used / quota) * 100) : 0;
  const pctRes = quota ? Math.min(100 - pctUsed, (reserved / quota) * 100) : 0;
  const hot = pctUsed + pctRes > 90;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-semibold tabular">
          {formatBytes(used)}
          <span className="font-normal text-muted">
            {' '}
            {quota ? `of ${formatBytes(quota)} used` : 'used (no quota set)'}
          </span>
        </p>
        {reserved > 0 && (
          <p className="text-xs text-muted tabular">
            {formatBytes(reserved)} reserved by uploads in progress
          </p>
        )}
      </div>
      {quota ? (
        <div
          role="meter"
          aria-label="Storage used"
          aria-valuemin={0}
          aria-valuemax={quota}
          aria-valuenow={used}
          aria-valuetext={`${formatBytes(used)} of ${formatBytes(quota)} used`}
          className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-surface-3"
        >
          <div
            className={cn('h-full', hot ? 'bg-danger' : 'bg-accent')}
            style={{ width: `${pctUsed}%` }}
          />
          <div className="stripe-progress h-full text-accent" style={{ width: `${pctRes}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-[15px] font-semibold tabular">{fmtCount(value)}</dd>
    </div>
  );
}

export function DashboardView() {
  const { data: me } = useMe();
  const admin = isAdminRole(me?.role);
  const usage = useOrgUsage();
  const recent = useRecent(6, 0);
  const shared = useReceivedShares({ includeInactive: false, limit: 5, offset: 0 });
  const notes = useNotifications({ limit: 1, unreadOnly: true, poll: true });
  const tasks = useMyTasks('pending', 1, 0);
  const toSign = useSignatureRequests('to_sign', 1, 0);
  const audit = useAuditEvents({ limit: 6, offset: 0 }, admin);

  return (
    <>
      <PageHeader
        title={`Welcome${me?.display_name ? `, ${me.display_name.split(' ')[0]}` : ''}`}
        description={me?.organization_name ?? undefined}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="p-4 lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold">Storage</h2>
          {usage.isPending ? (
            <Skeleton className="h-12" />
          ) : usage.isError ? (
            <ErrorState error={usage.error} onRetry={() => usage.refetch()} className="py-4" />
          ) : (
            <>
              <StorageMeter
                used={usage.data.used_bytes}
                reserved={usage.data.reserved_bytes}
                quota={usage.data.quota_bytes}
              />
              {admin && (
                <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3 sm:grid-cols-6">
                  <Count label="Documents" value={usage.data.documents} />
                  <Count label="Folders" value={usage.data.folders} />
                  <Count label="Versions" value={usage.data.versions} />
                  <Count label="People" value={usage.data.users} />
                  <Count label="Groups" value={usage.data.groups} />
                  <Count label="Scanning" value={usage.data.pending_scans} />
                </dl>
              )}
            </>
          )}
        </Panel>

        <Panel className="p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Bell className="size-4 text-muted" aria-hidden /> Notifications
          </h2>
          {notes.isPending ? (
            <Skeleton className="h-8" />
          ) : notes.isError ? (
            <ErrorState error={notes.error} onRetry={() => notes.refetch()} className="py-3" />
          ) : (
            <p className="text-[13px]">
              {notes.data.unread_count === 0 ? (
                'You are all caught up.'
              ) : (
                <>
                  You have <strong>{notes.data.unread_count}</strong> unread.{' '}
                  <Link className="text-accent underline underline-offset-2" href="/notifications">
                    Read them
                  </Link>
                </>
              )}
            </p>
          )}
          <ul className="mt-3 grid gap-1 text-[13px]" aria-label="Needs your attention">
            <li data-testid="attn-approvals">
              <Link className="text-accent hover:underline" href="/approvals">
                {tasks.data
                  ? `${tasks.data.total} approval${tasks.data.total === 1 ? '' : 's'} waiting for you`
                  : 'Approvals'}
              </Link>
            </li>
            <li data-testid="attn-signatures">
              <Link className="text-accent hover:underline" href="/signatures">
                {toSign.data
                  ? `${toSign.data.total} document${toSign.data.total === 1 ? '' : 's'} to sign`
                  : 'Signatures'}
              </Link>
            </li>
          </ul>
          {admin && usage.data && (
            <p className="mt-3 flex items-center gap-2 text-[13px]">
              <ShieldAlert
                className={cn(
                  'size-4',
                  usage.data.quarantined_documents ? 'text-danger' : 'text-muted',
                )}
                aria-hidden
              />
              {usage.data.quarantined_documents === 0 ? (
                'No quarantined files.'
              ) : (
                <Link className="text-danger hover:underline" href="/admin/quarantine">
                  {usage.data.quarantined_documents} quarantined file
                  {usage.data.quarantined_documents === 1 ? '' : 's'}
                </Link>
              )}
            </p>
          )}
        </Panel>

        <Panel className="lg:col-span-2">
          <div className="flex items-center justify-between px-4 pt-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="size-4 text-muted" aria-hidden /> Recently opened
            </h2>
            <Link className="text-xs text-accent hover:underline" href="/recent">
              See all
            </Link>
          </div>
          {recent.isPending ? (
            <div className="p-4">
              <Skeleton className="h-24" />
            </div>
          ) : recent.isError ? (
            <ErrorState error={recent.error} onRetry={() => recent.refetch()} className="py-6" />
          ) : recent.data.items.length === 0 ? (
            <EmptyState
              title="Nothing opened recently"
              description="Documents you preview or download show up here."
              className="py-8"
            />
          ) : (
            <ul className="mt-1 divide-y divide-line">
              {recent.data.items.map((r) => (
                <li key={r.id} className="flex items-center gap-2.5 px-4 py-2">
                  <ItemIcon kind={r.kind} contentType={r.content_type} />
                  <Link
                    className="truncate text-[13px] font-medium hover:text-accent hover:underline"
                    href={`/documents/${r.id}`}
                  >
                    {r.name}
                  </Link>
                  <StatusChip status={r.status} />
                  <span className="ml-auto whitespace-nowrap text-xs text-muted">
                    {formatRelative(r.updated_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <div className="flex items-center justify-between px-4 pt-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Share2 className="size-4 text-muted" aria-hidden /> Shared with me
              {shared.data && <span className="font-normal text-muted">({shared.data.total})</span>}
            </h2>
            <Link className="text-xs text-accent hover:underline" href="/shared-with-me">
              See all
            </Link>
          </div>
          {shared.isPending ? (
            <div className="p-4">
              <Skeleton className="h-24" />
            </div>
          ) : shared.isError ? (
            <ErrorState error={shared.error} onRetry={() => shared.refetch()} className="py-6" />
          ) : shared.data.items.length === 0 ? (
            <EmptyState title="Nothing shared with you" className="py-8" />
          ) : (
            <ul className="mt-1 divide-y divide-line">
              {shared.data.items.map((s) => (
                <li key={s.share_id} className="px-4 py-2">
                  <Link
                    className="block truncate text-[13px] font-medium hover:text-accent hover:underline"
                    href={
                      s.resource_type === 'document'
                        ? `/documents/${s.resource_id}`
                        : `/files/${s.resource_id}`
                    }
                  >
                    {s.name}
                  </Link>
                  <p className="truncate text-xs text-muted">
                    From {s.shared_by.display_name ?? s.shared_by.email} on{' '}
                    {formatDate(s.shared_at)}
                  </p>
                  {s.breadcrumb.length > 0 && <PathTrail segments={s.breadcrumb} size="sm" />}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {admin && (
          <Panel className="lg:col-span-3">
            <div className="flex items-center justify-between px-4 pt-3">
              <h2 className="text-sm font-semibold">Latest audit events</h2>
              <Link className="text-xs text-accent hover:underline" href="/admin/audit">
                Open audit log
              </Link>
            </div>
            <AuditTable
              data={audit.data}
              isLoading={audit.isPending}
              error={audit.error}
              onRetry={() => audit.refetch()}
              onOffsetChange={() => {}}
              compact
            />
          </Panel>
        )}
      </div>
    </>
  );
}
