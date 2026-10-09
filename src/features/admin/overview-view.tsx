'use client';

import Link from 'next/link';
import { AuditTable } from '@/components/admin/audit-table';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useOrgUsage } from '@/features/files/hooks';
import { formatBytes } from '@/lib/format';
import { useAuditEvents } from './hooks';

export function AdminOverview() {
  const u = useOrgUsage();
  const audit = useAuditEvents({ limit: 8, offset: 0 });
  return (
    <>
      <PageHeader title="Administration" description="Real-time counts for this organization." />
      <div className="grid gap-4">
        <Panel className="p-4">
          {u.isPending ? (
            <Skeleton className="h-16" />
          ) : u.isError ? (
            <ErrorState error={u.error} onRetry={() => u.refetch()} className="py-4" />
          ) : (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
              {[
                ['People', u.data.users, '/admin/users'],
                ['Groups', u.data.groups, '/admin/groups'],
                ['Documents', u.data.documents, null],
                ['Folders', u.data.folders, null],
                ['Waiting for scan', u.data.pending_scans, null],
                ['Quarantined', u.data.quarantined_documents, '/admin/quarantine'],
                ['Storage used', formatBytes(u.data.used_bytes), '/admin/storage'],
              ].map(([k, v, href]) => (
                <div key={k as string}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="text-[17px] font-semibold tabular">
                    {href ? <Link className="hover:text-accent hover:underline" href={href as string}>{typeof v === 'number' ? v.toLocaleString() : v}</Link> : typeof v === 'number' ? v.toLocaleString() : v}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>
        <Panel>
          <div className="flex items-center justify-between px-4 pt-3">
            <h2 className="text-sm font-semibold">Latest audit events</h2>
            <Link className="text-xs text-accent hover:underline" href="/admin/audit">Open audit log</Link>
          </div>
          <AuditTable data={audit.data} isLoading={audit.isPending} error={audit.error} onRetry={() => audit.refetch()} onOffsetChange={() => {}} compact />
        </Panel>
      </div>
    </>
  );
}
