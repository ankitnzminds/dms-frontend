'use client';

import { Play, Workflow } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useDocumentAutomationRuns, useStartable } from '@/features/automations/api';
import { StartWorkflowDialog } from './start-workflow-dialog';
import { WorkflowRunCard } from './workflow-run-card';

/** What has run on this file, live, and a way to start a workflow when one is available. */
export function DocumentWorkflowsPanel({ documentId, name }: { documentId: string; name: string }) {
  const runs = useDocumentAutomationRuns(documentId);
  const startable = useStartable('document', documentId);
  const [open, setOpen] = useState(false);
  const canStart = (startable.data?.length ?? 0) > 0;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">
          Workflows that ran on this file: automatic ones and ones started by a person.
        </p>
        {canStart && (
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Play /> Start workflow
          </Button>
        )}
      </div>
      {runs.isPending ? (
        <SkeletonRows rows={2} label="Loading workflows" />
      ) : runs.isError ? (
        <ErrorState error={runs.error} onRetry={() => void runs.refetch()} />
      ) : runs.data.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="No workflow has run on this file"
          description={
            canStart
              ? 'Use Start workflow to run one now.'
              : 'Workflows appear here when one runs on this file.'
          }
        />
      ) : (
        <ul className="grid gap-3" aria-label="Workflows on this file">
          {runs.data.map((r) => (
            <li key={r.id}>
              <WorkflowRunCard run={r} showItem={false} />
            </li>
          ))}
        </ul>
      )}
      {open && (
        <StartWorkflowDialog
          type="document"
          id={documentId}
          name={name}
          open
          onOpenChange={setOpen}
        />
      )}
    </div>
  );
}
