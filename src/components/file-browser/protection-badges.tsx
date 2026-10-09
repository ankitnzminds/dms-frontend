'use client';

import { Lock, Timer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useProtection, type Protection } from '@/features/governance/hooks';
import { formatDate } from '@/lib/format';

/** Reason Delete must be disabled, from the protection state (null when deletable). */
export function deleteBlockReason(p: Protection | undefined): string | null {
  if (!p || p.can_delete) return null;
  if (p.legal_hold) return 'This item is under a legal hold and cannot be deleted.';
  if (p.retention_until)
    return `This item is protected by a retention policy until ${formatDate(p.retention_until)}.`;
  return 'This item is protected and cannot be deleted.';
}

export function ProtectionBadges({ protection }: { protection: Protection | undefined }) {
  if (!protection) return null;
  const retention = protection.retention_until && new Date(protection.retention_until) > new Date();
  if (!protection.legal_hold && !retention) return null;
  return (
    <span className="inline-flex flex-wrap gap-1.5" data-testid="protection-badges">
      {protection.legal_hold && (
        <Badge tone="danger">
          <Lock aria-hidden /> Legal hold
        </Badge>
      )}
      {retention && (
        <Badge tone="warn">
          <Timer aria-hidden /> Retained until {formatDate(protection.retention_until)}
        </Badge>
      )}
    </span>
  );
}

/** Convenience: fetch + render for a given item. */
export function useDeleteGuard(kind: 'document' | 'folder', id: string | undefined) {
  const q = useProtection(kind, id);
  return { protection: q.data, reason: deleteBlockReason(q.data) };
}
