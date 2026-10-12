'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { useMe } from '@/features/auth/session';
import { friendlyMessage, isApiError } from '@/lib/api-client';
import { usePublish, type Automation } from './api';

/** Publishing is explicit: show what will run, who it runs as, and gate high-risk steps. */
export function PublishDialog({
  automation,
  onClose,
  onPublished,
}: {
  automation: Automation | null;
  onClose: () => void;
  onPublished?: (a: Automation) => void;
}) {
  const me = useMe();
  const publish = usePublish();
  const [confirm, setConfirm] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const a = automation;
  const owner = me.data?.role === 'owner';

  return (
    <Dialog open={!!a} onOpenChange={(o) => !o && !publish.isPending && onClose()}>
      <DialogContent
        title={`Publish “${a?.name ?? ''}”`}
        description="Publishing creates a new immutable version. It does nothing until the workflow is enabled."
      >
        {a && (
          <>
            <DialogBody className="grid gap-3 text-[13px]">
              <dl className="grid gap-1 rounded-md bg-surface-2 px-3 py-2 text-xs">
                <div className="flex gap-2">
                  <dt className="w-16 font-medium">IF</dt>
                  <dd>{a.if_this}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-16 font-medium">THEN</dt>
                  <dd>{a.then_that}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-16 font-medium">Runs as</dt>
                  <dd>You ({me.data?.email}). If your access is revoked, its runs stop.</dd>
                </div>
              </dl>
              {a.trigger.key.startsWith('manual_') && (
                <p className="rounded-md bg-info-soft px-3 py-2 text-xs text-info">
                  People start this workflow themselves
                  {(a.trigger.params as { who_can_start?: string }).who_can_start === 'admins'
                    ? ' (administrators only)'
                    : ' (anyone who can edit the file or folder, inside its scope)'}
                  . Its steps run with <strong>your</strong> access, not theirs, so only publish
                  what you are happy for them to trigger.
                </p>
              )}
              {a.high_risk && (
                <div className="grid gap-2 rounded-md border border-warn/40 bg-warn-soft px-3 py-2">
                  <p className="flex items-center gap-2 font-medium text-warn">
                    <Badge tone="warn">High risk</Badge> Delete, access or email steps
                  </p>
                  {!owner && (
                    <p className="text-xs">Only an organization owner can publish this workflow.</p>
                  )}
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={confirm}
                      onCheckedChange={(c) => setConfirm(c === true)}
                      disabled={!owner}
                      aria-label="Confirm high-risk workflow"
                    />
                    I understand and confirm
                  </label>
                </div>
              )}
              {issues.length > 0 && (
                <ul role="alert" className="grid gap-0.5 text-xs text-danger">
                  {issues.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={onClose} disabled={publish.isPending}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={publish.isPending || (a.high_risk && (!owner || !confirm))}
                onClick={() =>
                  publish.mutate(
                    { id: a.id, confirmHighRisk: confirm },
                    {
                      onSuccess: (r) => {
                        toast.success(
                          `Published version ${r.published_version}. Enable it to start it.`,
                        );
                        onPublished?.(r);
                        onClose();
                      },
                      onError: (e) => {
                        const list = isApiError(e)
                          ? (e.details as { issues?: { message: string }[] } | null)?.issues
                          : null;
                        setIssues(list?.map((i) => i.message) ?? [friendlyMessage(e)]);
                      },
                    },
                  )
                }
              >
                {publish.isPending && <Loader2 className="animate-spin" aria-hidden />} Publish
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
