'use client';

import { Share2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PaginationBar } from '@/components/file-browser/pagination-bar';
import { ItemIcon } from '@/components/file-browser/file-bits';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { ActionChips, RevokeShareButton, ShareStatusBadge, recipientLabel } from '@/components/sharing/share-bits';
import { Switch } from '@/components/ui/checkbox';
import { Label, Select } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useMe } from '@/features/auth/session';
import { useSentShares } from '@/features/sharing/hooks';
import { formatDate, formatExpiry } from '@/lib/format';
import { isAdminRole } from '@/lib/permissions';

const PAGE = 25;

export default function SharedByMePage() {
  const { data: me } = useMe();
  const admin = isAdminRole(me?.role);
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [inactive, setInactive] = useState(false);
  const [offset, setOffset] = useState(0);
  const q = useSentShares({ scope: admin ? scope : 'mine', includeInactive: inactive, limit: PAGE, offset });

  return (
    <>
      <PageHeader
        title="Shared by me"
        description="Shares you created. Revoking removes the recipients' access immediately."
        actions={
          <div className="flex flex-wrap items-center gap-4">
            {admin && (
              <div className="flex items-center gap-2">
                <Label htmlFor="scope" className="font-normal">Show</Label>
                <Select id="scope" className="w-44" value={scope} onChange={(e) => (setScope(e.target.value as 'mine' | 'all'), setOffset(0))}>
                  <option value="mine">Shares I created</option>
                  <option value="all">All shares in the organization</option>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch id="sent-inactive" checked={inactive} onCheckedChange={(c) => (setInactive(c), setOffset(0))} />
              <Label htmlFor="sent-inactive" className="font-normal">Show expired &amp; revoked</Label>
            </div>
          </div>
        }
      />
      <Panel>
        {q.isPending ? (
          <SkeletonRows rows={5} label="Loading shares" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState icon={Share2} title="You have not shared anything" description="Share a file or folder from its actions menu." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-[13px]">
                <caption className="sr-only">Shares you created</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th scope="col" className="px-3 py-2 font-medium">Item</th>
                    <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">Recipients</th>
                    <th scope="col" className="hidden px-3 py-2 font-medium lg:table-cell">Permissions</th>
                    <th scope="col" className="px-3 py-2 font-medium">Status</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.items.map((s) => (
                    <tr key={s.id} className="border-b border-line align-top last:border-0" data-testid="sent-share-row" data-status={s.status}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <ItemIcon kind={s.resource_type} />
                          {s.status === 'active' || s.resource_type ? (
                            <Link
                              className="truncate font-medium hover:text-accent hover:underline"
                              href={s.resource_type === 'document' ? `/documents/${s.resource_id}` : `/files/${s.resource_id}`}
                            >
                              {s.resource_name ?? 'Untitled'}
                            </Link>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted">
                          Shared {formatDate(s.created_at)}
                          {scope === 'all' && admin && ` by ${s.created_by.display_name ?? s.created_by.email}`}
                        </p>
                      </td>
                      <td className="hidden px-3 py-2.5 md:table-cell">{s.recipients.map(recipientLabel).join(', ')}</td>
                      <td className="hidden px-3 py-2.5 lg:table-cell">
                        <ActionChips actions={s.actions} />
                      </td>
                      <td className="px-3 py-2.5">
                        <ShareStatusBadge status={s.status} />
                        <span className="mt-1 block text-xs text-muted">{formatExpiry(s.expires_at)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <RevokeShareButton share={s} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar total={q.data.total} limit={PAGE} offset={offset} count={q.data.items.length} onOffsetChange={setOffset} />
          </>
        )}
      </Panel>
    </>
  );
}
