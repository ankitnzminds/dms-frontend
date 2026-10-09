import type { Notification } from '@/lib/api-client';

type Linkable = Pick<Notification, 'resource_type' | 'resource_id' | 'type'>;

/**
 * Where a notification takes the user. Only deep links the app can render; never a parent folder of a
 * shared/assigned item (share.revoked/expired carry no resource id and go to the shared list).
 */
export function notificationHref(n: Linkable): string | null {
  const { type, resource_type: rt, resource_id: id } = n;
  if (type.startsWith('workflow.')) {
    if (rt === 'workflow_run' && id) return `/approvals/runs/${id}`;
    return '/approvals';
  }
  if (type.startsWith('signature.')) {
    return rt === 'signature_request' && id ? `/signatures/${id}` : '/signatures';
  }
  if (type === 'share.revoked' || type === 'share.expired') return '/shared-with-me';
  if (!id) return type.startsWith('share') ? '/shared-with-me' : null;
  if (rt === 'document') return `/documents/${id}`;
  if (rt === 'folder') return `/files/${id}`;
  if (rt === 'workflow_run') return `/approvals/runs/${id}`;
  if (rt === 'workflow_task') return '/approvals';
  if (rt === 'signature_request') return `/signatures/${id}`;
  return null;
}
