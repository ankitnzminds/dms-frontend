'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/input';
import {
  useApprovalChain,
  useStartRun,
  useSubmitForApproval,
  useWorkflows,
} from '@/features/workflows/hooks';
import { friendlyMessage, isApiError } from '@/lib/api-client';

const CODE_TEXT: Record<string, string> = {
  run_in_progress: 'This document already has an approval in progress.',
  no_approvers: 'This workflow would have no approvers for this document. Pick another workflow.',
  workflow_archived: 'That workflow was archived. Pick another one.',
  unknown_assignee: 'A reviewer in this workflow no longer exists. Ask an administrator to fix it.',
};

export function SubmitApprovalDialog({
  documentId,
  documentName,
  open,
  onOpenChange,
  folderId,
}: {
  documentId: string;
  documentName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** The document's folder: when it has an approval chain, the chain decides the approvers. */
  folderId?: string;
}) {
  const defs = useWorkflows(false);
  const startManual = useStartRun(documentId);
  const startChain = useSubmitForApproval(documentId);
  const chain = useApprovalChain(folderId);
  const hasChain = (chain.data?.levels.length ?? 0) > 0;
  const start = hasChain ? startChain : startManual;
  const [defId, setDefId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const list = (defs.data ?? []).filter((d) => !d.archived);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Submit "${documentName}" for approval`}
        description="Reviewers get access to this exact document while their task is pending."
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const handlers = {
              onSuccess: () => {
                toast.success('Submitted for approval');
                onOpenChange(false);
                setNote('');
              },
              onError: (er: unknown) =>
                setError(
                  isApiError(er) && CODE_TEXT[er.code] ? CODE_TEXT[er.code]! : friendlyMessage(er),
                ),
            };
            if (hasChain) startChain.mutate({ note: note.trim() || null }, handlers);
            else startManual.mutate({ definition_id: defId, note: note.trim() || null }, handlers);
          }}
        >
          <DialogBody className="grid gap-3">
            {hasChain && chain.data ? (
              <div className="grid gap-1.5 text-[13px]" data-testid="approval-chain-preview">
                <p className="text-xs font-medium text-muted">
                  This folder has an approval chain. Levels approve in order; everyone inside a
                  level is asked in parallel.
                </p>
                {chain.data.levels.map((lv, i) => (
                  <p key={i} className="flex flex-wrap items-center gap-1.5">
                    <strong>L{i + 1}:</strong>
                    {lv.map((a) => (
                      <span
                        key={a.user_id}
                        className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-xs text-accent-soft-fg"
                      >
                        {a.is_super_approver ? '⚡ ' : ''}
                        {a.name}
                        {a.optional ? ' (optional)' : ''}
                      </span>
                    ))}
                  </p>
                ))}
              </div>
            ) : defs.isPending ? (
              <p className="text-xs text-muted">Loading workflows…</p>
            ) : list.length === 0 ? (
              <p className="text-[13px] text-muted">
                No approval workflows exist yet. An administrator can create one under
                Administration &gt; Workflows.
              </p>
            ) : (
              <Field id="wf-def" label="Workflow">
                {(p) => (
                  <Select {...p} value={defId} onChange={(e) => setDefId(e.target.value)}>
                    <option value="">Choose a workflow…</option>
                    {list.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.steps.length} step{d.steps.length === 1 ? '' : 's'})
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            <Field id="wf-note" label="Note for reviewers (optional)">
              {(p) => (
                <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              )}
            </Field>
            {error && (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={(!hasChain && !defId) || start.isPending}
            >
              {start.isPending && <Loader2 className="animate-spin" aria-hidden />} Submit for
              approval
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
