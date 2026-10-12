'use client';

import { Badge } from '@/components/ui/badge';
import { Tip } from '@/components/ui/tooltip';
import { useMe } from '@/features/auth/session';
import { useReceivedShares, useResourceShares, type ResourceKind } from '@/features/sharing/hooks';
import { recipientLabel } from './share-bits';

type Ref = { id?: string; display_name?: string | null; email?: string | null };
const nameOf = (u: Ref) => u.display_name || u.email || 'Someone';

/**
 * The "Shared" badge. Hovering it says who shared the item and with whom. The details come from the
 * existing share APIs, so people only learn what they are already allowed to see: whoever can manage or
 * created the shares sees "who shared it with whom"; someone who only received it sees who shared it
 * with them.
 */
export function SharedBadge({ kind, id }: { kind: ResourceKind; id: string }) {
  return (
    <Tip label={<Details kind={kind} id={id} />}>
      <span
        tabIndex={0}
        className="group inline-flex cursor-default rounded-md outline-none"
        data-testid="shared-badge"
      >
        <Badge className="transition-colors group-hover:bg-accent-soft group-hover:text-accent-soft-fg group-focus-visible:bg-accent-soft group-focus-visible:text-accent-soft-fg">
          Shared
        </Badge>
      </span>
    </Tip>
  );
}

// Mounted only while the tooltip is open, so nothing is fetched until someone hovers.
function Details({ kind, id }: { kind: ResourceKind; id: string }) {
  const { data: me } = useMe();
  const sent = useResourceShares(kind, id);
  const received = useReceivedShares({ includeInactive: false, limit: 100, offset: 0 });

  const active = (sent.data ?? []).filter((s) => s.status === 'active');
  if (active.length > 0) {
    const mine = (u: Ref) => (u.id && u.id === me?.user_id ? 'You' : nameOf(u));
    const lines = active.slice(0, 3).map((s) => {
      const who = s.recipients.length
        ? s.recipients
            .slice(0, 4)
            .map((r) =>
              r.type === 'organization' ? 'everyone in the organization' : recipientLabel(r),
            )
            .join(', ') + (s.recipients.length > 4 ? ` +${s.recipients.length - 4} more` : '')
        : s.link_enabled
          ? 'anyone with the link'
          : 'no one yet';
      return `Shared by ${mine(s.created_by)} with ${who}`;
    });
    return (
      <span className="grid gap-0.5">
        {lines.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
        {active.length > 3 && <span>+{active.length - 3} more shares</span>}
      </span>
    );
  }

  if (sent.isPending || received.isPending) return <span>Loading…</span>;

  const got = received.data?.items.find((r) => r.resource_id === id && r.status === 'active');
  if (got) return <span>Shared with you by {nameOf(got.shared_by)}</span>;

  return <span>Shared. Who it is shared with is visible to people who manage sharing.</span>;
}
