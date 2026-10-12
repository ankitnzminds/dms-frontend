'use client';

import { History } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ItemIcon } from '@/components/file-browser/file-bits';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Select } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminUsers } from '@/features/admin-users/api';
import { useMe } from '@/features/auth/session';
import { formatRelative } from '@/lib/format';
import { canReadAudit } from '@/lib/permissions';
import {
  describeAction,
  useMyActivity,
  useOrgActivity,
  type MyActivity,
  type OrgActivity,
} from './api';

const href = (type: string, id: string) =>
  type === 'folder' ? `/files/${id}` : `/documents/${id}`;

function Target({ type, id, name }: { type: string; id: string; name: string | null }) {
  if (!name) return <span className="text-muted">an item you can no longer see</span>;
  return (
    <Link
      href={href(type, id)}
      className="inline-flex items-center gap-1 font-medium hover:underline"
    >
      <ItemIcon kind={type === 'folder' ? 'folder' : 'document'} name={name} size={14} />
      <span className="break-all">{name}</span>
    </Link>
  );
}

function Mine() {
  const q = useMyActivity(true);
  if (q.isPending) return <SkeletonRows rows={5} label="Loading your activity" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data.length === 0)
    return (
      <EmptyState
        icon={History}
        title="No activity yet"
        description="Things you do with files and folders show up here."
      />
    );
  return (
    <ul className="divide-y divide-line" aria-label="Your activity">
      {q.data.map((a: MyActivity) => (
        <li key={a.id} className="px-4 py-3 text-[13px]" data-testid="activity-item">
          <p>
            <strong>You</strong> {a.verb}{' '}
            <Target type={a.target_type} id={a.target_id} name={a.target_name} />
          </p>
          <p className="mt-0.5 text-xs text-muted">{formatRelative(a.at)}</p>
        </li>
      ))}
    </ul>
  );
}

function AllUsers() {
  const [userId, setUserId] = useState<string>('');
  const users = useAdminUsers({
    q: '',
    status: 'all',
    sort: 'display_name',
    descending: false,
    limit: 200,
    offset: 0,
  });
  const q = useOrgActivity(true, userId || null);

  // User-wise: one block per person, newest event first inside each block.
  const groups = useMemo(() => {
    const m = new Map<string, OrgActivity[]>();
    for (const e of q.data?.items ?? []) {
      const key = e.actor_email ?? 'System';
      m.set(key, [...(m.get(key) ?? []), e]);
    }
    return [...m.entries()];
  }, [q.data]);

  return (
    <div>
      <div className="border-b border-line px-4 py-3">
        <label htmlFor="activity-user" className="mb-1 block text-xs text-muted">
          User
        </label>
        <Select id="activity-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">All users</option>
          {(users.data?.items ?? []).map((u) => (
            <option key={u.user_id} value={u.user_id}>
              {u.display_name ? `${u.display_name} (${u.email})` : u.email}
            </option>
          ))}
        </Select>
      </div>
      {q.isPending ? (
        <SkeletonRows rows={5} label="Loading activity" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={History}
          title="No file activity"
          description="Nothing to show for this selection."
        />
      ) : (
        groups.map(([who, events]) => (
          <section key={who} aria-label={`Activity of ${who}`} data-testid="activity-user-group">
            <h3 className="sticky top-0 border-b border-line bg-surface-2 px-4 py-1.5 text-xs font-semibold">
              {who} <span className="font-normal text-muted">({events.length})</span>
            </h3>
            <ul className="divide-y divide-line">
              {events.map((e) => (
                <li key={e.id} className="px-4 py-2.5 text-[13px]" data-testid="activity-item">
                  <p>
                    {describeAction(e.action)}{' '}
                    {e.target_id && (e.target_type === 'document' || e.target_type === 'folder') ? (
                      <Target type={e.target_type} id={e.target_id} name={e.target_label ?? null} />
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{formatRelative(e.occurred_at)}</p>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {q.data?.next_cursor && (
        <p className="px-4 py-3 text-xs text-muted">Showing the latest 100 events.</p>
      )}
    </div>
  );
}

/**
 * Right-hand activity panel. Everyone gets "My activity"; administrators and auditors also get "All users",
 * grouped user by user. What each person may see is decided by the server.
 */
export function ActivityPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data: me } = useMe();
  const admin = canReadAudit(me);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        side="right"
        title="Activity"
        description={admin ? 'Your activity and everyone else’s.' : 'What you did recently.'}
      >
        {open && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {admin ? (
              <Tabs defaultValue="mine">
                <TabsList aria-label="Activity views" className="px-4">
                  <TabsTrigger value="mine">My activity</TabsTrigger>
                  <TabsTrigger value="all">All users</TabsTrigger>
                </TabsList>
                <TabsContent value="mine">
                  <Mine />
                </TabsContent>
                <TabsContent value="all">
                  <AllUsers />
                </TabsContent>
              </Tabs>
            ) : (
              <Mine />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
