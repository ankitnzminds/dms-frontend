'use client';

import { Loader2 } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  useLockItems,
  type LockOptions,
  type LockResult,
  type LockTarget,
} from '@/features/explorer/hooks';

const MAX_DAYS = 365;

/** What is being locked, in words: "file", "folder", "3 items". */
function noun(targets: LockTarget[]): string {
  if (targets.length > 1) return `${targets.length} items`;
  return targets[0]?.kind === 'folder' ? 'folder' : 'file';
}

/** datetime-local value for "now + minutes" in the user's own time zone. */
function localInput(minutesFromNow: number): string {
  const d = new Date(Date.now() + minutesFromNow * 60_000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** null when fine; otherwise why the chosen end time cannot be used. */
export function validateLockEnd(value: string, now = Date.now()): string | null {
  if (!value) return 'Choose when the lock ends.';
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return 'Enter a valid date and time.';
  if (t <= now + 60_000) return 'The end time must be in the future.';
  if (t > now + MAX_DAYS * 86_400_000) return `A lock can last at most ${MAX_DAYS} days.`;
  return null;
}

/** One summary for everything that was attempted: successes and each failure, never a silent skip. */
function report(results: LockResult[], verb: 'locked' | 'unlocked', extraSkipped: string[]) {
  const ok = results.filter((r) => r.ok);
  const bad = results.filter((r) => !r.ok);
  if (bad.length === 0 && extraSkipped.length === 0) {
    toast.success(ok.length === 1 ? `${ok[0]!.target.name} ${verb}` : `${ok.length} items ${verb}`);
    return;
  }
  const lines = [...bad.map((r) => `${r.target.name}: ${r.message ?? 'failed'}`), ...extraSkipped];
  const head = ok.length
    ? `${ok.length} ${verb}, ${lines.length} not ${verb}.`
    : `Nothing ${verb}.`;
  toast.error(`${head} ${lines.slice(0, 3).join(' · ')}${lines.length > 3 ? ' …' : ''}`, {
    duration: 9000,
  });
}

/**
 * "Lock selected file/folder?": optional download prevention and an end time (never, or a date and time).
 * The server enforces permissions, other people's locks and the end-time limits for every item.
 */
export function LockDialog({
  targets,
  skipped = [],
  onClose,
}: {
  targets: LockTarget[];
  /** Items left out before asking (already locked / no permission), named so nothing is hidden. */
  skipped?: string[];
  onClose: () => void;
}) {
  const lock = useLockItems();
  const id = useId();
  const [prevent, setPrevent] = useState(false);
  const [never, setNever] = useState(true);
  const [until, setUntil] = useState('');
  const [touched, setTouched] = useState(false);
  const n = noun(targets);
  const problem = never ? null : validateLockEnd(until);

  const submit = () => {
    setTouched(true);
    if (problem) return;
    const options: LockOptions = {
      expiresAt: never ? null : new Date(until).toISOString(),
      preventDownload: prevent,
    };
    lock.mutate(
      { targets, lock: true, options },
      {
        onSuccess: (results) => {
          report(results, 'locked', skipped);
          onClose();
        },
        onError: () => toast.error('Could not lock. Check your connection and try again.'),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !lock.isPending && onClose()}>
      <DialogContent title={`Lock selected ${n}?`} className="max-w-lg">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <DialogBody className="grid gap-4">
            <p className="text-lg font-medium">You are about to lock the selected {n}</p>
            <p className="text-[13px] text-muted">
              Locking indicates that you are actively working on{' '}
              {targets.length > 1 ? 'these items' : `this ${n}`} and prevents others from modifying{' '}
              {targets.length > 1 ? 'them' : 'it'}. It does not give anyone access and does not
              change who it is shared with.
            </p>
            {skipped.length > 0 && (
              <p role="note" className="rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">
                Not included: {skipped.join('; ')}
              </p>
            )}
            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox
                checked={prevent}
                onCheckedChange={(c) => setPrevent(c === true)}
                data-testid="lock-prevent-download"
              />
              Prevent others from downloading {targets.length > 1 ? 'these items' : `this ${n}`}{' '}
              while locked
            </label>
            <fieldset className="grid gap-2 border-t border-line pt-3">
              <legend className="mb-1 text-[13px] font-semibold">Expires</legend>
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="radio"
                  name={`${id}-exp`}
                  checked={never}
                  onChange={() => setNever(true)}
                  data-testid="lock-expires-never"
                />
                Never
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="radio"
                  name={`${id}-exp`}
                  checked={!never}
                  onChange={() => {
                    setNever(false);
                    if (!until) setUntil(localInput(24 * 60));
                  }}
                  data-testid="lock-expires-on"
                />
                On
              </label>
              {!never && (
                <div className="grid gap-1 pl-6">
                  <Input
                    type="datetime-local"
                    aria-label="Lock end date and time"
                    min={localInput(2)}
                    max={localInput(MAX_DAYS * 24 * 60)}
                    value={until}
                    onChange={(e) => setUntil(e.target.value)}
                    aria-invalid={touched && !!problem}
                    data-testid="lock-until"
                  />
                  {touched && problem && (
                    <p role="alert" className="text-xs text-danger">
                      {problem}
                    </p>
                  )}
                </div>
              )}
            </fieldset>
          </DialogBody>
          <DialogFooter>
            <Button type="submit" variant="primary" disabled={lock.isPending} data-testid="lock-ok">
              {lock.isPending && <Loader2 className="animate-spin" aria-hidden />}
              OK
            </Button>
            <Button variant="secondary" onClick={onClose} disabled={lock.isPending}>
              Cancel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Unlock confirmation. Unlocking only makes the item editable again; it grants nothing. */
export function UnlockDialog({
  targets,
  skipped = [],
  onClose,
}: {
  targets: LockTarget[];
  skipped?: string[];
  onClose: () => void;
}) {
  const lock = useLockItems();
  const n = noun(targets);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Unlock selected ${n}?`}
      description={
        <>
          {targets.length > 1 ? 'These items' : `This ${n}`} will become available for changes
          again, according to each person&apos;s existing permissions. Unlocking does not give
          anyone more access.
          {skipped.length > 0 && (
            <span className="mt-2 block text-warn">Not included: {skipped.join('; ')}</span>
          )}
        </>
      }
      confirmLabel="Unlock"
      pending={lock.isPending}
      onConfirm={async () => {
        try {
          const results = await lock.mutateAsync({ targets, lock: false });
          report(results, 'unlocked', skipped);
        } catch {
          toast.error('Could not unlock. Check your connection and try again.');
        }
        onClose();
      }}
    />
  );
}
