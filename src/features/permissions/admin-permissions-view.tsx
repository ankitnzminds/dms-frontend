'use client';

import { Inbox, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PaginationBar } from '@/components/file-browser/pagination-bar';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useAdminUsers } from '@/features/admin-users/api';
import { useAdminGroups } from '@/features/admin/hooks';
import { AccessTable } from './access-table';
import { useOrgAccess, type OrgAccessFilters } from './api';

const PAGE = 25;
const SELECT =
  'h-9 rounded-md border border-line-strong bg-surface px-2 text-[13px] text-text focus-visible:outline-2 focus-visible:outline-accent';

type Tab = 'all' | 'shares' | 'expiring';
const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'Permissions' },
  { id: 'shares', label: 'Active shares' },
  { id: 'expiring', label: 'Expiring soon' },
];

export function AdminPermissionsView() {
  const [tab, setTab] = useState<Tab>('all');
  const [days, setDays] = useState(14);
  const [f, setF] = useState({ userId: '', groupId: '', q: '', offset: 0 });
  const filters: OrgAccessFilters = {
    source: tab === 'shares' ? 'share' : 'all',
    expiringWithinDays: tab === 'expiring' ? days : undefined,
    ...f,
    limit: PAGE,
  };
  const q = useOrgAccess(filters);
  const users = useAdminUsers({
    q: '',
    status: 'all',
    sort: 'display_name',
    descending: false,
    limit: 100,
    offset: 0,
  });
  const groups = useAdminGroups();
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, offset: 0, ...p }));
  const items = q.data?.items ?? [];
  const filtered = !!(f.userId || f.groupId || f.q);

  return (
    <>
      <PageHeader
        title="Permissions"
        description="Every live permission and share in this organization. Changes are made on the item itself (Manage permissions / Share) and are recorded in the audit log."
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href="/requests">
                <Inbox /> Access requests
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/audit">
                <ShieldCheck /> Audit log
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh"
              onClick={() => void q.refetch()}
            >
              <RefreshCw className={q.isFetching ? 'animate-spin' : ''} />
            </Button>
          </>
        }
      />

      <div
        role="tablist"
        aria-label="Permission views"
        className="mb-3 flex gap-1 border-b border-line"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id);
              set({});
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium ${
              tab === t.id
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Panel className="mb-3 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative sm:col-span-2">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Search by item or person"
            placeholder="Search by item or person"
            className="pl-8"
            value={f.q}
            onChange={(e) => set({ q: e.target.value })}
          />
        </div>
        <select
          aria-label="Person"
          className={SELECT}
          value={f.userId}
          onChange={(e) => set({ userId: e.target.value })}
        >
          <option value="">Person: anyone</option>
          {(users.data?.items ?? []).map((u) => (
            <option key={u.user_id} value={u.user_id}>
              {u.display_name ?? u.email}
            </option>
          ))}
        </select>
        <select
          aria-label="Group"
          className={SELECT}
          value={f.groupId}
          onChange={(e) => set({ groupId: e.target.value })}
        >
          <option value="">Group: any</option>
          {(groups.data?.items ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        {tab === 'expiring' && (
          <select
            aria-label="Expiring within"
            className={SELECT}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[7, 14, 30, 90].map((d) => (
              <option key={d} value={d}>
                Within {d} days
              </option>
            ))}
          </select>
        )}
        {filtered && (
          <Button size="sm" variant="ghost" onClick={() => set({ userId: '', groupId: '', q: '' })}>
            Clear filters
          </Button>
        )}
      </Panel>

      <Panel className="min-w-0">
        {q.isPending ? (
          <SkeletonRows rows={6} label="Loading permissions" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={
              tab === 'expiring'
                ? `Nothing expires in the next ${days} days`
                : filtered
                  ? 'Nothing matches these filters'
                  : 'No permissions or shares yet'
            }
            description="Items owners hold in their own space are not listed; only explicit permissions and shares are."
          />
        ) : (
          <>
            <AccessTable items={items} caption="Live permissions and shares" />
            <PaginationBar
              total={q.data?.total ?? 0}
              limit={PAGE}
              offset={f.offset}
              count={items.length}
              onOffsetChange={(offset) => setF((x) => ({ ...x, offset }))}
            />
          </>
        )}
      </Panel>
    </>
  );
}
