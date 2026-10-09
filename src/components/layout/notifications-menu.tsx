'use client';

import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { Popover } from 'radix-ui';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useMarkAllRead, useMarkRead, useNotifications } from '@/features/notifications/hooks';
import { notificationHref } from '@/features/notifications/links';
import { friendlyMessage, type Notification } from '@/lib/api-client';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

export function NotificationRow({ n, onOpen }: { n: Notification; onOpen?: () => void }) {
  const markRead = useMarkRead();
  const href = notificationHref(n);
  const unread = !n.read_at;
  const body = (
    <>
      <span
        aria-hidden
        className={cn(
          'mt-1.5 size-2 shrink-0 rounded-full',
          unread ? 'bg-accent' : 'bg-transparent',
        )}
      />
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[13px]', unread && 'font-semibold')}>
          {n.title}
        </span>
        {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
        <span className="block text-xs text-faint">{formatRelative(n.created_at)}</span>
      </span>
      {unread && <span className="sr-only">Unread</span>}
    </>
  );
  const cls = 'flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-surface-2';
  const handle = () => {
    if (unread) markRead.mutate(n.id);
    onOpen?.();
  };
  return href ? (
    <Link href={href} onClick={handle} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={handle} className={cls}>
      {body}
    </button>
  );
}

export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const q = useNotifications({ limit: 8, poll: true });
  const markAll = useMarkAllRead();
  const unread = q.data?.unread_count ?? 0;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        >
          <Bell />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-accent-fg"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={8}
          className="animate-pop z-50 w-[22rem] max-w-[calc(100vw-1rem)] rounded-lg border border-line bg-surface shadow-pop"
        >
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <h2 className="text-[13px] font-semibold">Notifications</h2>
            <Button
              size="sm"
              variant="ghost"
              disabled={unread === 0 || markAll.isPending}
              onClick={() =>
                markAll.mutate(undefined, {
                  onSuccess: (r) =>
                    toast.success(`Marked ${(r as { updated?: number })?.updated ?? 0} as read`),
                  onError: (e) => toast.error(friendlyMessage(e)),
                })
              }
            >
              <CheckCheck /> Mark all read
            </Button>
          </div>
          <div className="scroll-thin max-h-96 overflow-y-auto">
            {q.isPending ? (
              <SkeletonRows rows={3} label="Loading notifications" />
            ) : q.isError ? (
              <ErrorState error={q.error} onRetry={() => q.refetch()} className="py-6" />
            ) : q.data.items.length === 0 ? (
              <EmptyState
                title="You are all caught up"
                description="New shares and updates will appear here."
                className="py-8"
              />
            ) : (
              <ul className="divide-y divide-line">
                {q.data.items.map((n) => (
                  <li key={n.id}>
                    <NotificationRow n={n} onOpen={() => setOpen(false)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-line p-1.5">
            <Button asChild variant="ghost" size="sm" className="w-full">
              <Link href="/notifications" onClick={() => setOpen(false)}>
                View all notifications
              </Link>
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
