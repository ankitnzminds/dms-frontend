'use client';

import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Share2 } from 'lucide-react';
import { useResourceShares, type ResourceKind } from '@/features/sharing/hooks';
import { formatDate, formatExpiry } from '@/lib/format';
import { ActionChips, RevokeShareButton, ShareStatusBadge, recipientLabel } from './share-bits';

/** Shares of a single document/folder (GET /documents|folders/{id}/shares). */
export function ResourceShares({ kind, id, canShare }: { kind: ResourceKind; id: string; canShare: boolean }) {
  const q = useResourceShares(kind, id);
  if (q.isPending) return <SkeletonRows rows={3} label="Loading shares" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data.length === 0)
    return (
      <EmptyState
        icon={Share2}
        title="Not shared with anyone"
        description={canShare ? 'Use Share to give specific people or groups access to this item.' : 'You cannot share this item.'}
      />
    );
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-surface" aria-label="Shares">
      {q.data.map((s) => (
        <li key={s.id} className="flex flex-wrap items-start gap-3 px-3 py-3" data-testid="share-row">
          <div className="min-w-0 flex-1 grid gap-1">
            <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
              {s.recipients.map(recipientLabel).join(', ') || 'No recipients'} <ShareStatusBadge status={s.status} />
            </p>
            <ActionChips actions={s.actions} />
            <p className="text-xs text-muted">
              Shared {formatDate(s.created_at)} by {s.created_by.display_name ?? s.created_by.email} · {formatExpiry(s.expires_at)}
              {s.revoked_at && ` · revoked ${formatDate(s.revoked_at)}`}
            </p>
            {s.message && <p className="text-xs italic text-muted">“{s.message}”</p>}
          </div>
          <RevokeShareButton share={s} />
        </li>
      ))}
    </ul>
  );
}
