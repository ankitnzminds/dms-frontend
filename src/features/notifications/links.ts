import type { Notification } from '@/lib/api-client';

/** Where a notification should take the user, if anywhere. Only deep links the app can render. */
export function notificationHref(n: Pick<Notification, 'resource_type' | 'resource_id' | 'type'>): string | null {
  if (!n.resource_id) return n.type.startsWith('share') ? '/shared-with-me' : null;
  if (n.resource_type === 'document') return `/documents/${n.resource_id}`;
  if (n.resource_type === 'folder') return `/files/${n.resource_id}`;
  if (n.resource_type === 'share') return '/shared-with-me';
  return null;
}
