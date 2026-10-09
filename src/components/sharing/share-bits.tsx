'use client';

import { Ban, Clock, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useRevokeShare } from '@/features/sharing/hooks';
import { friendlyMessage, type Share } from '@/lib/api-client';
import { actionLabel } from '@/lib/permissions';

export function ShareStatusBadge({ status }: { status: 'active' | 'expired' | 'revoked' }) {
  if (status === 'active') return <Badge tone="ok">Active</Badge>;
  if (status === 'expired')
    return (
      <Badge tone="warn">
        <Clock aria-hidden /> Expired
      </Badge>
    );
  return (
    <Badge tone="danger">
      <Ban aria-hidden /> Access revoked
    </Badge>
  );
}

export function ActionChips({ actions }: { actions: string[] }) {
  if (actions.length === 0) return <span className="text-xs text-muted">No permissions</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {actions.map((a) => (
        <Badge key={a} tone="neutral">
          {actionLabel(a)}
        </Badge>
      ))}
    </span>
  );
}

export function recipientLabel(r: Share['recipients'][number]) {
  return r.type === 'group' ? `${r.name ?? 'Group'} (group)` : (r.email ?? r.name ?? 'Unknown user');
}

export function RevokeShareButton({ share, label = 'Revoke' }: { share: Pick<Share, 'id' | 'resource_name' | 'status'>; label?: string }) {
  const [open, setOpen] = useState(false);
  const revoke = useRevokeShare();
  if (share.status !== 'active') return null;
  return (
    <>
      <Button size="sm" variant="danger-ghost" onClick={() => setOpen(true)} aria-label={`Revoke share of ${share.resource_name ?? 'item'}`}>
        {revoke.isPending ? <Loader2 className="animate-spin" /> : <Ban />} {label}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Revoke this share?"
        description={`Recipients will immediately lose access to "${share.resource_name ?? 'this item'}". This cannot be undone, but you can share it again.`}
        confirmLabel="Revoke share"
        destructive
        pending={revoke.isPending}
        onConfirm={() =>
          revoke.mutate(share.id, {
            onSuccess: () => {
              toast.success('Share revoked');
              setOpen(false);
            },
            onError: (e) => toast.error(friendlyMessage(e)),
          })
        }
      />
    </>
  );
}
