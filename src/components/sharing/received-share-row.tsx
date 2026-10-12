'use client';

import { Download, Eye, FolderOpen } from 'lucide-react';
import { accessLevel } from '@/features/sharing/schemas';
import Link from 'next/link';
import { PathTrail } from '@/components/navigation/path-trail';
import { ResourceHover, ResourceTr } from '@/components/explorer/resource-actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DisabledReason } from '@/components/ui/tooltip';
import { ItemIcon } from '@/components/file-browser/file-bits';
import { isPreviewableType } from '@/features/files/availability';
import { can, actionLabel } from '@/lib/permissions';
import type { ReceivedShare } from '@/lib/api-client';
import { formatBytes, formatDateTime, formatExpiry } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ShareStatusBadge } from './share-bits';

const PERM_ORDER = [
  'view',
  'preview',
  'download',
  'edit_metadata',
  'rename',
  'upload_version',
  'comment',
  'create_child',
];

/** Summarise the granted actions into a few readable chips. */
export function permissionChips(actions: string[]) {
  return PERM_ORDER.filter((a) => actions.includes(a)).map(actionLabel);
}

export interface ReceivedShareRowProps {
  share: ReceivedShare;
  onPreview?: (s: ReceivedShare) => void;
  onDownload?: (s: ReceivedShare) => void;
  /** Inside a ResourceActionsProvider: adds the shared right-click menu and hover toolbar. */
  interactive?: boolean;
}

/** One row of "Shared with me". Inactive (expired/revoked) rows are never openable. */
export function ReceivedShareRow({
  share: s,
  onPreview,
  onDownload,
  interactive,
}: ReceivedShareRowProps) {
  const active = s.status === 'active';
  const isDoc = s.resource_type === 'document';
  const href = isDoc ? `/documents/${s.resource_id}` : `/files/${s.resource_id}`;
  const dlReason = !isDoc
    ? 'Folders cannot be downloaded.'
    : can(s.actions, 'download')
      ? null
      : 'The owner did not grant download.';
  const pvReason = !isDoc
    ? 'Folders cannot be previewed.'
    : !can(s.actions, 'preview')
      ? 'The owner did not grant preview.'
      : s.content_type && !isPreviewableType(s.content_type, s.name)
        ? 'This file type cannot be previewed.'
        : null;
  const rowClass = cn(
    'border-b border-line align-middle last:border-0',
    !active && 'bg-surface-2/60',
  );
  const wrap = (children: React.ReactNode) =>
    interactive && active ? (
      <ResourceTr
        item={{ kind: s.resource_type, id: s.resource_id, name: s.name }}
        className={cn(rowClass, 'hover:bg-surface-2')}
        data-testid="received-share-row"
        data-status={s.status}
      >
        {children}
      </ResourceTr>
    ) : (
      <tr className={rowClass} data-testid="received-share-row" data-status={s.status}>
        {children}
      </tr>
    );
  return wrap(
    <>
      <td className="px-4 py-3">
        <div className="@container flex min-w-0 items-start gap-2.5">
          <ItemIcon
            kind={s.resource_type}
            contentType={s.content_type}
            name={s.name}
            className="mt-0.5"
          />
          <div className="min-w-0">
            {active ? (
              <Link
                href={href}
                className="block truncate font-medium hover:text-accent hover:underline"
              >
                {s.name}
              </Link>
            ) : (
              <span className="block truncate font-medium text-muted">{s.name}</span>
            )}
            {active && s.breadcrumb.length > 0 ? (
              <PathTrail segments={s.breadcrumb} size="sm" className="mt-0.5" />
            ) : (
              !active && (
                <span className="text-xs text-muted">
                  Location hidden: this share is no longer active
                </span>
              )
            )}
            {s.message && <p className="mt-0.5 text-xs italic text-muted">“{s.message}”</p>}
          </div>
          {interactive && active && <ResourceHover compact />}
        </div>
      </td>
      <td className="hidden px-3 py-3 lg:table-cell">
        <span className="block truncate" title={s.shared_by.email ?? undefined}>
          {s.shared_by.display_name ?? s.shared_by.email}
        </span>
        <span className="text-xs text-muted">{formatDateTime(s.shared_at)}</span>
      </td>
      <td className="hidden px-3 py-3 md:table-cell">
        {active ? (
          <span className="flex flex-wrap gap-1">
            <Badge tone="info" data-testid="access-level">
              {accessLevel(s.actions)}
            </Badge>
            {can(s.actions, 'comment') && (
              <span className="basis-full text-xs text-muted">You can comment</span>
            )}
            {permissionChips(s.actions).map((c) => (
              <Badge key={c}>{c}</Badge>
            ))}
          </span>
        ) : (
          <span className="text-xs text-muted">No access</span>
        )}
        {isDoc && (
          <span className="mt-1 block text-xs text-faint">{formatBytes(s.size_bytes)}</span>
        )}
      </td>
      <td className="px-3 py-3">
        <ShareStatusBadge status={s.status} />
        <span className="mt-1 block truncate text-xs text-muted">{formatExpiry(s.expires_at)}</span>
      </td>
      <td className="px-3 py-3 text-right">
        {active ? (
          <span className="inline-flex items-center justify-end gap-1">
            <Button asChild size="icon-sm" variant="ghost">
              <Link href={href} aria-label={`Open ${s.name}`} title="Open">
                <FolderOpen />
              </Link>
            </Button>
            {isDoc && (
              <>
                <DisabledReason reason={pvReason}>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Preview ${s.name}`}
                    disabled={!!pvReason}
                    onClick={() => onPreview?.(s)}
                  >
                    <Eye />
                  </Button>
                </DisabledReason>
                <DisabledReason reason={dlReason}>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Download ${s.name}`}
                    disabled={!!dlReason}
                    onClick={() => onDownload?.(s)}
                  >
                    <Download />
                  </Button>
                </DisabledReason>
              </>
            )}
          </span>
        ) : (
          <span className="text-xs text-muted">Not openable</span>
        )}
      </td>
    </>,
  );
}
