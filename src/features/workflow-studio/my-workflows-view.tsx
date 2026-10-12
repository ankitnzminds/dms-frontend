'use client';

import { ListChecks, Workflow } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PaginationBar } from '@/components/file-browser/pagination-bar';
import { PageHeader } from '@/components/layout/page-header';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { WorkflowRunCard } from '@/components/workflows/workflow-run-card';
import { useMyRuns } from '@/features/automations/api';

const PAGE = 10;

/** The workflows I started by hand, with live progress. Nothing here is visible to anyone else. */
export function MyWorkflowsView() {
  const [offset, setOffset] = useState(0);
  const q = useMyRuns(offset, PAGE);
  const running = q.data?.items.filter((r) => ['queued', 'running', 'waiting'].includes(r.status));
  return (
    <>
      <PageHeader
        title="Workflows"
        description="Workflows you started, and where each one is now."
        actions={
          <Link
            href="/approvals"
            className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline"
          >
            <ListChecks className="size-4" aria-hidden /> My approvals
          </Link>
        }
      />
      {q.isPending ? (
        <SkeletonRows rows={3} label="Loading workflows" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="You have not started a workflow yet"
          description="Open a file or folder and choose Start workflow. Workflows are made available by your administrators."
        />
      ) : (
        <>
          {running && running.length > 0 && (
            <p role="status" className="mb-3 text-[13px] text-muted">
              {running.length} in progress. This page updates by itself.
            </p>
          )}
          <ul className="grid gap-3" aria-label="Workflows I started">
            {q.data.items.map((r) => (
              <li key={r.id}>
                <WorkflowRunCard run={r} />
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
    </>
  );
}
