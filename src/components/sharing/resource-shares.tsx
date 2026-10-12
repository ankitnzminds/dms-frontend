'use client';

import { Globe2, Link2, Pencil, Share2, Users } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { DisabledReason } from '@/components/ui/tooltip';
import { useResourceShares, type ResourceKind } from '@/features/sharing/hooks';
import { SHARE_PERMS } from '@/features/sharing/link-hooks';
import type { Share } from '@/lib/api-client';
import { formatDateTime, formatExpiry } from '@/lib/format';
import { actionLabel } from '@/lib/permissions';
import { ShareLinkDialog } from './share-link-dialog';
import { RevokeShareButton, ShareStatusBadge } from './share-bits';

type Recipient = Share['recipients'][number];

const PERM_LABEL = Object.fromEntries(SHARE_PERMS.map(([k, l]) => [k, l])) as Record<
  string,
  string
>;
const TYPE_LABEL: Record<Recipient['type'], string> = {
  user: 'User',
  group: 'Group',
  organization: 'Everyone',
};

const initials = (s: string) =>
  s
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || '?';

/** Avatar + name (+ e-mail) for one recipient; groups and "everyone" get their own icon. */
function Who({ r }: { r: Recipient }) {
  const everyone = r.type === 'organization';
  const group = r.type === 'group';
  const title = everyone ? 'Everyone in the organization' : (r.name ?? r.email ?? 'Unknown user');
  const sub = everyone ? 'All members' : group ? null : r.name && r.email ? r.email : null;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-soft-fg"
        aria-hidden
      >
        {everyone ? (
          <Globe2 className="size-4" />
        ) : group ? (
          <Users className="size-4" />
        ) : (
          initials(title)
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium" title={title}>
          {title}
        </span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
    </div>
  );
}

/** What this person or group may do, with the labels the share dialog uses (View, Download, ...). */
function Perms({ keys }: { keys: string[] }) {
  if (keys.length === 0) return <span className="text-xs text-muted">No permissions</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {keys.map((k) => (
        <Badge key={k}>{PERM_LABEL[k] ?? k}</Badge>
      ))}
    </span>
  );
}

/**
 * Who this item is shared with (GET /documents|folders/{id}/shares). Each share is a block: a header with its
 * status, who shared it, when it ends and its actions, then ONE ROW PER USER OR GROUP with exactly what that
 * person or group may do. "Share" opens the same dialog as everywhere else; every active share can be edited
 * (people, permissions, expiry) or revoked. What each person may do is still decided by the server.
 */
export function ResourceShares({
  kind,
  id,
  name,
  canShare,
  shareBlockedReason,
}: {
  kind: ResourceKind;
  id: string;
  name: string;
  canShare: boolean;
  /** An extra reason sharing is not allowed for this item (e.g. its classification). */
  shareBlockedReason?: string | null;
}) {
  const q = useResourceShares(kind, id);
  const [dialog, setDialog] = useState<{ shareId?: string } | null>(null);
  const reason =
    shareBlockedReason ?? (canShare ? null : 'You do not have permission to share this item.');
  const active = (q.data ?? []).filter((s) => s.status === 'active');
  const people = new Set(active.flatMap((s) => s.recipients.map((r) => `${r.type}:${r.id}`))).size;

  const header = (
    <div className="border-b border-line px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold">Who has access</h2>
        <p className="text-xs text-muted" data-testid="share-count">
          {q.data
            ? `${people} ${people === 1 ? 'person or group' : 'people and groups'} · ${active.length} active share${active.length === 1 ? '' : 's'}${
                q.data.length > active.length ? ` · ${q.data.length - active.length} ended` : ''
              }`
            : 'Loading…'}
        </p>
      </div>
    </div>
  );
  const shareDialog = dialog && (
    <ShareLinkDialog
      open
      kind={kind}
      id={id}
      name={name}
      shareId={dialog.shareId}
      onOpenChange={(o) => !o && setDialog(null)}
    />
  );

  if (q.isPending) return <SkeletonRows rows={3} label="Loading shares" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data.length === 0)
    return (
      <div className="rounded-lg border border-line bg-surface">
        {header}
        <EmptyState
          icon={Share2}
          title="Not shared with anyone"
          description={
            reason ?? 'Share this item with specific people or groups, or create a link.'
          }
        />
        {shareDialog}
      </div>
    );

  return (
    <div className="rounded-lg border border-line bg-surface">
      {header}
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-[13px]">
          <caption className="sr-only">Shares of {name}</caption>
          <colgroup>
            <col className="w-[30%]" />
            <col className="hidden w-[30%] md:table-column" />
            <col className="w-[22%] min-w-32" />
            <col className="w-24" />
          </colgroup>
          <thead>
            <tr className="border-b border-line text-left text-xs font-medium text-muted">
              <th scope="col" className="px-4 py-2.5 font-medium">
                Recipients
              </th>
              <th scope="col" className="hidden px-3 py-2.5 font-medium md:table-cell">
                Permissions
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Status
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Actions
              </th>
            </tr>
          </thead>
          {q.data.map((s) => {
            const rows: { key: string; r: Recipient | null }[] =
              s.recipients.length === 0
                ? [{ key: 'link', r: null }]
                : s.recipients.map((r) => ({ key: `${r.type}-${r.id}`, r }));
            return (
              <tbody
                key={s.id}
                className="border-b border-line last:border-0"
                data-testid="share-row"
                data-status={s.status}
              >
                {rows.map(({ key, r }, i) => (
                  <tr
                    key={key}
                    className="hover:bg-surface-2"
                    data-testid={r ? 'share-recipient' : undefined}
                  >
                    <td className="px-4 py-2.5 align-middle">
                      {r ? (
                        <Who r={r} />
                      ) : (
                        <div className="flex items-center gap-2.5">
                          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
                            <Link2 className="size-4" aria-hidden />
                          </span>
                          <span>
                            <span className="block font-medium">
                              {s.link_enabled ? 'Anyone with the link' : 'No recipients yet'}
                            </span>
                            <span className="block text-xs text-muted">
                              {s.link_enabled
                                ? 'Signed-in members who open it'
                                : 'Use Edit to add people'}
                            </span>
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="hidden px-3 py-2.5 align-middle md:table-cell">
                      {r ? (
                        <div className="grid gap-1">
                          <Perms keys={r.permissions} />
                          {r.type !== 'user' && (
                            <span className="text-xs text-muted">{TYPE_LABEL[r.type]}</span>
                          )}
                        </div>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {s.actions.length ? (
                            s.actions
                              .slice(0, 4)
                              .map((a) => <Badge key={a}>{actionLabel(a)}</Badge>)
                          ) : (
                            <span className="text-xs text-muted">No permissions</span>
                          )}
                        </span>
                      )}
                    </td>
                    {i === 0 && (
                      <>
                        <td
                          rowSpan={rows.length}
                          className="border-l border-line px-3 py-2.5 align-middle"
                        >
                          <ShareStatusBadge status={s.status} />
                          <span className="mt-1 block truncate text-xs text-muted">
                            {s.revoked_at
                              ? `Revoked ${formatDateTime(s.revoked_at)}`
                              : formatExpiry(s.expires_at)}
                          </span>
                          <span
                            className="mt-1 block truncate text-xs text-muted"
                            title={s.created_by.email ?? undefined}
                          >
                            By {s.created_by.display_name ?? s.created_by.email},{' '}
                            {formatDateTime(s.created_at)}
                          </span>
                        </td>
                        <td rowSpan={rows.length} className="px-3 py-2.5 text-right align-middle">
                          <span className="inline-flex items-center justify-end gap-1">
                            <DisabledReason
                              reason={
                                s.status !== 'active'
                                  ? 'Only active shares can be changed.'
                                  : !s.can_manage
                                    ? 'Only the owner or an administrator can change this share.'
                                    : null
                              }
                            >
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                disabled={s.status !== 'active' || !s.can_manage}
                                aria-label="Edit this share"
                                title="Edit permissions"
                                onClick={() => setDialog({ shareId: s.id })}
                                data-testid="share-row-edit"
                              >
                                <Pencil />
                              </Button>
                            </DisabledReason>
                            <RevokeShareButton share={s} iconOnly />
                          </span>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {s.message && (
                  <tr>
                    <td colSpan={4} className="px-4 pb-2 text-xs italic text-muted">
                      “{s.message}”
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
      </div>
      {shareDialog}
    </div>
  );
}
