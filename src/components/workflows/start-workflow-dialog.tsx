'use client';

import { Loader2, Play } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useStartable, useStartWorkflow } from '@/features/automations/api';
import { friendlyMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

/** Pick one of the workflows an administrator made available for this file or folder, and start it. */
export function StartWorkflowDialog({
  type,
  id,
  name,
  open,
  onOpenChange,
}: {
  type: 'document' | 'folder';
  id: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const q = useStartable(type, id, open);
  const start = useStartWorkflow();
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const options = q.data ?? [];
  const chosen = options.find((o) => o.id === picked) ?? (options.length === 1 ? options[0] : null);

  function run() {
    if (!chosen) return;
    start.mutate(
      { id: chosen.id, type, resourceId: id, note: note.trim() || null },
      {
        onSuccess: () => {
          toast.success(`“${chosen.name}” started`, {
            description: 'You can follow it under Workflows.',
          });
          setNote('');
          setPicked(null);
          onOpenChange(false);
        },
        onError: (e) => toast.error(friendlyMessage(e)),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Start a workflow"
        description={`Run a workflow on “${name}”.`}
        className="max-w-lg"
      >
        <DialogBody className="grid gap-3">
          {q.isPending ? (
            <SkeletonRows rows={2} label="Loading workflows" />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          ) : options.length === 0 ? (
            <EmptyState
              title="No workflow is available for this item"
              description="An administrator makes workflows available per folder or file type. You also need permission to edit the item."
            />
          ) : (
            <>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-[13px] font-medium">Workflows</legend>
                {options.map((o) => {
                  const on = chosen?.id === o.id;
                  return (
                    <label
                      key={o.id}
                      className={cn(
                        'flex cursor-pointer gap-2.5 rounded-lg border px-3 py-2 hover:bg-surface-2',
                        on ? 'border-accent bg-accent-soft/40 ring-1 ring-accent' : 'border-line',
                      )}
                    >
                      <input
                        type="radio"
                        name="start-workflow"
                        className="mt-1"
                        checked={on}
                        onChange={() => setPicked(o.id)}
                      />
                      <span className="min-w-0 text-[13px]">
                        <span className="flex items-center gap-2 font-medium">
                          {o.name}
                          {o.who_can_start === 'admins' && <Badge tone="outline">Admins</Badge>}
                        </span>
                        {(o.instructions || o.description) && (
                          <span className="mt-0.5 block text-xs text-muted">
                            {o.instructions || o.description}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
                {!chosen && (
                  <p className="text-xs text-muted">Choose the workflow you want to run.</p>
                )}
              </fieldset>
              <div className="grid gap-1">
                <label htmlFor="start-note" className="text-[13px] font-medium">
                  Note <span className="font-normal text-muted">(optional)</span>
                </label>
                <Textarea
                  id="start-note"
                  rows={2}
                  maxLength={300}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Anything the next person should know"
                />
              </div>
              <p className="text-xs text-muted">
                The steps run with the access of the administrator who published the workflow.
                Everything it does is recorded in the audit log.
              </p>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button asChild variant="ghost">
            <Link href="/workflows">My workflows</Link>
          </Button>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!chosen || start.isPending} onClick={run}>
            {start.isPending ? <Loader2 className="animate-spin" /> : <Play />} Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
