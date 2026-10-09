'use client';

import { Badge } from '@/components/ui/badge';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useOrgUsage } from '@/features/files/hooks';
import { fmtCount, formatBytes } from '@/lib/format';

export function StorageView() {
  const u = useOrgUsage();
  return (
    <>
      <PageHeader title="Storage" description="Quota and usage for this organization." />
      <div className="grid max-w-3xl gap-4">
        <Panel className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Usage</h2>
          {u.isPending ? (
            <Skeleton className="h-20" />
          ) : u.isError ? (
            <ErrorState error={u.error} onRetry={() => u.refetch()} className="py-4" />
          ) : (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ['Used', formatBytes(u.data.used_bytes)],
                ['Reserved by uploads', formatBytes(u.data.reserved_bytes)],
                [
                  'Quota',
                  u.data.quota_bytes === null ? 'No quota' : formatBytes(u.data.quota_bytes),
                ],
                [
                  'Free',
                  u.data.quota_bytes === null
                    ? '-'
                    : formatBytes(
                        Math.max(0, u.data.quota_bytes - u.data.used_bytes - u.data.reserved_bytes),
                      ),
                ],
                ['Documents', fmtCount(u.data.documents)],
                ['Versions', fmtCount(u.data.versions)],
                ['Folders', fmtCount(u.data.folders)],
                ['Waiting for scan', fmtCount(u.data.pending_scans)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="text-[15px] font-semibold tabular">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>
        <Panel className="p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            Storage provider <Badge tone="warn">Not available yet</Badge>
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            Choosing or migrating the storage provider cannot be done from this app yet. Files are
            stored in the provider configured by the platform team when the service was deployed.
          </p>
        </Panel>
      </div>
    </>
  );
}
