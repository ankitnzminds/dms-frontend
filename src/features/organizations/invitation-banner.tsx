'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MailPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useMe } from '@/features/auth/session';
import { api, friendlyMessage } from '@/lib/api-client';
import { setActiveOrganizationId } from './org-store';

/** Pending organization invitations with an Accept action (POST /me/invitations/{org}/accept). */
export function InvitationBanner() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const accept = useMutation({
    mutationFn: async (organizationId: string) => {
      await api.POST('/api/v1/me/invitations/{organization_id}/accept', {
        params: { path: { organization_id: organizationId } },
      });
      return organizationId;
    },
    onSuccess: (organizationId, _v, _ctx) => {
      toast.success('Invitation accepted');
      setActiveOrganizationId(organizationId);
      qc.clear();
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(friendlyMessage(e)),
  });

  const pending = me?.pending_invitations ?? [];
  if (pending.length === 0) return null;
  return (
    <div role="region" aria-label="Pending invitations" className="border-b border-line bg-info-soft px-4 py-2.5 text-[13px] text-info">
      <ul className="grid gap-1.5">
        {pending.map((inv) => (
          <li key={inv.organization_id} className="flex flex-wrap items-center gap-2">
            <MailPlus className="size-4" aria-hidden />
            <span>
              You have been invited to join <strong>{inv.organization_name}</strong> as {inv.role}.
            </span>
            <Button
              size="sm"
              variant="primary"
              disabled={accept.isPending}
              onClick={() => accept.mutate(inv.organization_id)}
            >
              Accept invitation
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
