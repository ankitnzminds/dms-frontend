'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { RunCard } from '@/components/workflows/run-card';
import { useMe } from '@/features/auth/session';
import { isAdminRole } from '@/lib/permissions';
import { useRun } from './hooks';

/** One approval run. Links only to the document itself (never to its parent folders). */
export function RunView({ runId }: { runId: string }) {
  const q = useRun(runId);
  const { data: me } = useMe();
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isPending) return <Skeleton className="h-48" />;
  const r = q.data;
  const canManage = me?.user_id === r.started_by.id || isAdminRole(me?.role);
  return (
    <>
      <PageHeader
        title={r.document_name ?? 'Approval'}
        description="Approval progress"
        actions={
          <Link
            className="text-[13px] text-accent hover:underline"
            href={`/documents/${r.document_id}`}
          >
            Open document
          </Link>
        }
      />
      <RunCard run={r} canManage={canManage} />
    </>
  );
}
