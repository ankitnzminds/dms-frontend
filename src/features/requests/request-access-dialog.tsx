'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Label, Textarea } from '@/components/ui/input';
import { friendlyMessage, type ActionName } from '@/lib/api-client';
import { actionLabel } from '@/lib/permissions';
import { accessRequestError, useCreateAccessRequest } from './hooks';

const REQUESTABLE: ActionName[] = [
  'view',
  'preview',
  'download',
  'edit_metadata',
  'rename',
  'upload_version',
  'share',
  'comment',
];

export function RequestAccessDialog({
  kind,
  id,
  name,
  have,
  onClose,
}: {
  kind: 'document' | 'folder';
  id: string;
  name: string;
  /** Permissions the caller already holds (they are not offered). */
  have: readonly string[];
  onClose: () => void;
}) {
  const create = useCreateAccessRequest();
  const options = REQUESTABLE.filter((a) => !have.includes(a));
  const [actions, setActions] = useState<ActionName[]>(
    options.filter((a) => a === 'view' || a === 'download'),
  );
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Request access to "${name}"`}
        description="An approver decides. A request does not grant anything by itself."
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (actions.length === 0) return setFieldError('Choose the access you need');
            if (!reason.trim()) return setFieldError('Tell the approver why you need access');
            setFieldError(null);
            create.mutate(
              { resource_type: kind, resource_id: id, actions, reason: reason.trim() },
              {
                onSuccess: () => {
                  toast.success('Access request sent');
                  onClose();
                },
                onError: (er) => setError(accessRequestError(er) ?? friendlyMessage(er)),
              },
            );
          }}
        >
          <DialogBody className="grid gap-3">
            {options.length === 0 ? (
              <p className="text-[13px] text-muted">
                You already have every access that can be requested.
              </p>
            ) : (
              <fieldset className="grid gap-1.5">
                <legend className="text-[13px] font-medium">Access you need</legend>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {options.map((a) => (
                    <div key={a} className="flex items-center gap-2">
                      <Checkbox
                        id={`req-${a}`}
                        checked={actions.includes(a)}
                        onCheckedChange={(c) =>
                          setActions(c ? [...actions, a] : actions.filter((x) => x !== a))
                        }
                      />
                      <Label htmlFor={`req-${a}`} className="font-normal">
                        {actionLabel(a)}
                      </Label>
                    </div>
                  ))}
                </div>
              </fieldset>
            )}
            <Field id="req-reason" label="Reason" error={fieldError ?? undefined}>
              {(p) => (
                <Textarea
                  {...p}
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              )}
            </Field>
            {error && (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={create.isPending || options.length === 0}
            >
              {create.isPending && <Loader2 className="animate-spin" aria-hidden />} Send request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
