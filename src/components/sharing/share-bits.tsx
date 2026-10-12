'use client';

import { Ban, Clock, Loader2 } from 'lucide-react';
import { accessLevel } from '@/features/sharing/schemas';
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

export function ActionChips({ actions, max }: { actions: string[]; max?: number }) {
  if (actions.length === 0) return <span className="text-xs text-muted">No permissions</span>;
  const shown = max ? actions.slice(0, max) : actions;
  const hidden = max ? actions.slice(max) : [];
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Badge tone="info" data-testid="access-level">
        {accessLevel(actions)}
      </Badge>
      {shown.map((a) => (
        <Badge key={a} tone="neutral">
          {actionLabel(a)}
        </Badge>
      ))}
      {hidden.length > 0 && (
        <span className="text-xs text-muted" title={hidden.map(actionLabel).join(', ')}>
          +{hidden.length} more
        </span>
      )}
    </span>
  );
}

export function recipientLabel(r: Share['recipients'][number]) {
  return r.type === 'group'
    ? `${r.name ?? 'Group'} (group)`
    : (r.email ?? r.name ?? 'Unknown user');
}

export function RevokeShareButton({
  share,
  label = 'Revoke',
  iconOnly,
}: {
  share: Pick<Share, 'id' | 'resource_name' | 'status'>;
  label?: string;
  /** Just the icon (the accessible name and tooltip still say "Revoke"). */
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const revoke = useRevokeShare();
  if (share.status !== 'active') return null;
  return (
    <>
      <Button
        size={iconOnly ? 'icon-sm' : 'sm'}
        variant="danger-ghost"
        onClick={() => setOpen(true)}
        aria-label={`Revoke share of ${share.resource_name ?? 'item'}`}
        title={iconOnly ? label : undefined}
      >
        {revoke.isPending ? <Loader2 className="animate-spin" /> : <Ban />}
        {!iconOnly && ` ${label}`}
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
