'use client';

import { Pencil, Search, Share2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ResourceHover,
  ResourceActionsProvider,
  ResourceTr,
} from '@/components/explorer/resource-actions';
import { PaginationBar } from '@/components/file-browser/pagination-bar';
import { ItemIcon } from '@/components/file-browser/file-bits';
import { PageHeader, Panel } from '@/components/layout/page-header';
import {
  ActionChips,
  RevokeShareButton,
  ShareStatusBadge,
  recipientLabel,
} from '@/components/sharing/share-bits';
import { ShareLinkDialog } from '@/components/sharing/share-link-dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/checkbox';
import { DisabledReason } from '@/components/ui/tooltip';
import { Input, Label, Select } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useMe } from '@/features/auth/session';
import { useSentShares } from '@/features/sharing/hooks';
import { formatDateTime, formatExpiry } from '@/lib/format';
import type { Share } from '@/lib/api-client';
import { isAdminRole } from '@/lib/permissions';

const PAGE = 25;

/** Who the share is for: the first two, then "+N more" (full list on hover); an honest note when none. */
function Recipients({ share }: { share: Share }) {
  const all = share.recipients.map(recipientLabel);
  if (all.length === 0)
    return (
      <span className="text-xs text-muted">
        {share.link_enabled ? 'Anyone with the link' : 'No recipients'}
      </span>
    );
  return (
    <div className="min-w-0 text-xs" title={all.join(', ')}>
      {all.slice(0, 2).map((r) => (
        <p key={r} className="truncate">
          {r}
        </p>
      ))}
      {all.length > 2 && <p className="text-muted">+{all.length - 2} more</p>}
    </div>
  );
}

export default function SharedByMePage() {
  const { data: me } = useMe();
  const admin = isAdminRole(me?.role);
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [inactive, setInactive] = useState(false);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Share | null>(null);
  const term = search.trim().toLowerCase();
  // The share list has no server-side search, so while searching we load up to 200 shares at once and
  // match them here (item name, recipients, or who shared it).
  const q = useSentShares({
    scope: admin ? scope : 'mine',
    includeInactive: inactive,
    limit: term ? 200 : PAGE,
    offset: term ? 0 : offset,
  });
  const items = useMemo(() => {
    const all = q.data?.items ?? [];
    if (!term) return all;
    return all.filter((s) =>
      [
        s.resource_name ?? '',
        ...s.recipients.map(recipientLabel),
        s.created_by.display_name ?? '',
        s.created_by.email ?? '',
      ].some((v) => v.toLowerCase().includes(term)),
    );
  }, [q.data, term]);

  return (
    <ResourceActionsProvider>
      <PageHeader
        title="Shared by me"
        description="Shares you created. Revoking removes the recipients' access immediately."
        actions={
          <div className="flex flex-wrap items-center gap-4">
            {admin && (
              <div className="flex items-center gap-2">
                <Label htmlFor="scope" className="font-normal">
                  Show
                </Label>
                <Select
                  id="scope"
                  className="w-44"
                  value={scope}
                  onChange={(e) => (setScope(e.target.value as 'mine' | 'all'), setOffset(0))}
                >
                  <option value="mine">Shares I created</option>
                  <option value="all">All shares in the organization</option>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch
                id="sent-inactive"
                checked={inactive}
                onCheckedChange={(c) => (setInactive(c), setOffset(0))}
              />
              <Label htmlFor="sent-inactive" className="font-normal">
                Show expired &amp; revoked
              </Label>
            </div>
          </div>
        }
      />
      <div className="mb-3 flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5">
        <div className="relative w-full max-w-md">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Search files and folders"
            placeholder="Search files and folders"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="shared-by-me-search"
          />
        </div>
        {term && q.data && (
          <p className="text-xs text-muted" aria-live="polite">
            {items.length} of {q.data.items.length}
            {q.data.total > q.data.items.length ? ' (the first 200 shares)' : ''}
          </p>
        )}
      </div>
      <Panel>
        {q.isPending ? (
          <SkeletonRows rows={5} label="Loading shares" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Share2}
            title={term ? 'No shares match your search' : 'You have not shared anything'}
            description={
              term
                ? 'Try another file or folder name, or a person.'
                : 'Share a file or folder from its actions menu.'
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-[13px]">
                <caption className="sr-only">Shares you created</caption>
                <colgroup>
                  <col />
                  <col className="hidden w-[22%] md:table-column" />
                  <col className="hidden w-[24%] lg:table-column" />
                  <col className="w-32" />
                  <col className="w-28" />
                </colgroup>
                <thead>
                  <tr className="border-b border-line text-left text-xs font-medium text-muted">
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Item
                    </th>
                    <th scope="col" className="hidden px-3 py-2.5 font-medium md:table-cell">
                      Recipients
                    </th>
                    <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">
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
                <tbody>
                  {items.map((s) => (
                    <ResourceTr
                      key={s.id}
                      item={{
                        kind: s.resource_type,
                        id: s.resource_id,
                        name: s.resource_name ?? 'Untitled',
                      }}
                      className="border-b border-line align-middle last:border-0 hover:bg-surface-2"
                      data-testid="sent-share-row"
                      data-status={s.status}
                    >
                      <td className="px-4 py-3">
                        <div className="@container flex min-w-0 items-center gap-2.5">
                          <ItemIcon kind={s.resource_type} name={s.resource_name} />
                          <Link
                            className="min-w-0 truncate font-medium hover:text-accent hover:underline"
                            title={s.resource_name ?? 'Untitled'}
                            href={
                              s.resource_type === 'document'
                                ? `/documents/${s.resource_id}`
                                : `/files/${s.resource_id}`
                            }
                          >
                            {s.resource_name ?? 'Untitled'}
                          </Link>
                          <ResourceHover compact />
                        </div>
                        <p className="mt-0.5 truncate pl-[30px] text-xs text-muted">
                          Shared {formatDateTime(s.created_at)}
                          {scope === 'all' &&
                            admin &&
                            ` by ${s.created_by.display_name ?? s.created_by.email}`}
                        </p>
                      </td>
                      <td className="hidden px-3 py-3 md:table-cell">
                        <Recipients share={s} />
                      </td>
                      <td className="hidden px-3 py-3 lg:table-cell">
                        <ActionChips actions={s.actions} max={3} />
                      </td>
                      <td className="px-3 py-3">
                        <ShareStatusBadge status={s.status} />
                        <span className="mt-1 block truncate text-xs text-muted">
                          {formatExpiry(s.expires_at)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
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
                              aria-label={`Edit permissions for ${s.resource_name ?? 'this item'}`}
                              title="Edit permissions"
                              onClick={() => setEditing(s)}
                              data-testid="edit-share"
                            >
                              <Pencil />
                            </Button>
                          </DisabledReason>
                          <RevokeShareButton share={s} iconOnly />
                        </span>
                      </td>
                    </ResourceTr>
                  ))}
                </tbody>
              </table>
            </div>
            {!term && (
              <PaginationBar
                total={q.data.total}
                limit={PAGE}
                offset={offset}
                count={q.data.items.length}
                onOffsetChange={setOffset}
              />
            )}
          </>
        )}
      </Panel>
      {editing && (
        <ShareLinkDialog
          open
          kind={editing.resource_type}
          id={editing.resource_id}
          name={editing.resource_name ?? 'Untitled'}
          shareId={editing.id}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
    </ResourceActionsProvider>
  );
}
