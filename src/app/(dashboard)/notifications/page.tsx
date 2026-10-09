'use client';

import { Bell, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { NotificationRow } from '@/components/layout/notifications-menu';
import { PaginationBar } from '@/components/file-browser/pagination-bar';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useMarkAllRead, useNotifications } from '@/features/notifications/hooks';
import { friendlyMessage } from '@/lib/api-client';

const PAGE = 25;

export default function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const q = useNotifications({ limit: PAGE, offset, unreadOnly, poll: true });
  const markAll = useMarkAllRead();
  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          <>
            <div className="flex items-center gap-2">
              <Switch
                id="unread-only"
                checked={unreadOnly}
                onCheckedChange={(c) => (setUnreadOnly(c), setOffset(0))}
              />
              <Label htmlFor="unread-only" className="font-normal">
                Unread only
              </Label>
            </div>
            <Button
              disabled={!q.data?.unread_count || markAll.isPending}
              onClick={() =>
                markAll.mutate(undefined, { onError: (e) => toast.error(friendlyMessage(e)) })
              }
            >
              <CheckCheck /> Mark all read
            </Button>
          </>
        }
      />
      <Panel>
        {q.isPending ? (
          <SkeletonRows rows={5} label="Loading notifications" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={unreadOnly ? 'No unread notifications' : 'No notifications yet'}
            description="Shares and other events that involve you appear here."
          />
        ) : (
          <>
            <ul className="divide-y divide-line" aria-label="Notifications">
              {q.data.items.map((n) => (
                <li key={n.id}>
                  <NotificationRow n={n} />
                </li>
              ))}
            </ul>
            <PaginationBar
              total={q.data.total}
              limit={PAGE}
              offset={offset}
              count={q.data.items.length}
              onOffsetChange={setOffset}
            />
          </>
        )}
      </Panel>
    </>
  );
}
