'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/input';
import { useStartRun, useWorkflows } from '@/features/workflows/hooks';
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
}: {
  documentId: string;
  documentName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const defs = useWorkflows(false);
  const start = useStartRun(documentId);
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
            start.mutate(
              { definition_id: defId, note: note.trim() || null },
              {
                onSuccess: () => {
                  toast.success('Submitted for approval');
                  onOpenChange(false);
                  setNote('');
                },
                onError: (er) =>
                  setError(
                    isApiError(er) && CODE_TEXT[er.code]
                      ? CODE_TEXT[er.code]!
                      : friendlyMessage(er),
                  ),
              },
            );
          }}
        >
          <DialogBody className="grid gap-3">
            {defs.isPending ? (
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
            <Button type="submit" variant="primary" disabled={!defId || start.isPending}>
              {start.isPending && <Loader2 className="animate-spin" aria-hidden />} Submit for
              approval
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
