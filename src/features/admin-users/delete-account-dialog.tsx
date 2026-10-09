'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { friendlyMessage, isApiError } from '@/lib/api-client';
import { formatBytes } from '@/lib/format';
import { useDeleteImpact, useDeleteUser, type AdminUser } from './api';

/**
 * Account removal. The server keeps files, history and audit (retention first), signs the person out
 * everywhere and takes them out of groups. Deleting requires the checkbox and the typed email.
 */
export function DeleteAccountDialog({
  user,
  onClose,
  onDeleted,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Delete account" description={user?.email}>
        {user && <Body user={user} onClose={onClose} onDeleted={onDeleted} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  user,
  onClose,
  onDeleted,
}: {
  user: AdminUser;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const impact = useDeleteImpact(user.user_id);
  const del = useDeleteUser();
  const [checked, setChecked] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ready = checked && typed.trim().toLowerCase() === user.email;

  return (
    <>
      <DialogBody className="grid gap-3">
        {impact.isPending ? (
          <Skeleton className="h-24" />
        ) : impact.isError ? (
          <ErrorState error={impact.error} onRetry={() => void impact.refetch()} />
        ) : (
          <>
            <p className="rounded-md bg-warn-soft px-3 py-2 text-[13px] text-warn">
              {impact.data.summary}
            </p>
            <ul className="grid gap-1 text-[13px]">
              <li>
                Files owned: <strong>{impact.data.owned_documents}</strong> (
                {formatBytes(impact.data.owned_bytes)}) — kept
              </li>
              <li>
                Active shares created: <strong>{impact.data.active_shares_created}</strong> — kept
                until they expire or are revoked
              </li>
              <li>
                Group memberships removed: <strong>{impact.data.group_memberships}</strong>
              </li>
            </ul>
          </>
        )}
        <label className="flex items-start gap-2 text-[13px]">
          <Checkbox
            checked={checked}
            onCheckedChange={(v) => setChecked(v === true)}
            aria-label="Confirm and continue with deletion"
          />
          <span>Confirm and continue with deletion?</span>
        </label>
        <div className="grid gap-1">
          <Label htmlFor="del-email">Type the account email to confirm</Label>
          <Input
            id="del-email"
            autoComplete="off"
            placeholder={user.email}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose} disabled={del.isPending}>
          Cancel
        </Button>
        <Button
          variant="danger"
          disabled={!ready || del.isPending || impact.isPending}
          onClick={() =>
            del.mutate(
              { userId: user.user_id, email: user.email },
              {
                onSuccess: () => {
                  toast.success(`Account ${user.email} deleted. Files were kept.`);
                  onDeleted?.();
                  onClose();
                },
                onError: (e) =>
                  setError(
                    isApiError(e) && e.code === 'last_owner'
                      ? 'The organization must keep at least one active owner.'
                      : friendlyMessage(e),
                  ),
              },
            )
          }
        >
          {del.isPending && <Loader2 className="animate-spin" aria-hidden />} Delete
        </Button>
      </DialogFooter>
    </>
  );
}
