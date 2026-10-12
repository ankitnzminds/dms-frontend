'use client';

import { Lock, X } from 'lucide-react';
import { CommentThread } from '@/components/comments/comment-thread';
import { VersionsPanel } from '@/components/file-browser/versions-panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { liveCount, useComments } from '@/features/comments/hooks';
import { PathTrail } from '@/components/navigation/path-trail';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useProperties } from '@/features/explorer/hooks';
import { actionLabel } from '@/lib/permissions';
import { formatBytes, formatDateTime } from '@/lib/format';

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted">{k}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/**
 * Properties of ONE item (GET .../properties). Counts cover only what the caller may see; share and ACL
 * counts are null for people who cannot manage access and are never inferred.
 */
export function PropertiesPanel({
  target,
  onClose,
  selectionCount = 0,
  initialTab = 'properties',
}: {
  target: { kind: 'document' | 'folder'; id: string } | null;
  onClose: () => void;
  selectionCount?: number;
  initialTab?: 'properties' | 'comments' | 'versions';
}) {
  const comments = useComments(target);
  const count = liveCount(comments.data);
  const q = useProperties(target?.kind, target?.id);
  return (
    <aside
      aria-label="Details"
      className="rounded-lg border border-line bg-surface shadow-sm"
      data-testid="properties-panel"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="truncate text-sm font-semibold">{q.data?.name ?? 'Details'}</h2>
        <Button size="icon-sm" variant="ghost" aria-label="Close properties" onClick={onClose}>
          <X />
        </Button>
      </div>
      {target && (
        <Tabs key={`${target.kind}-${target.id}`} defaultValue={initialTab} className="px-4 pb-4">
          <TabsList aria-label="Detail sections">
            <TabsTrigger value="properties">Properties</TabsTrigger>
            <TabsTrigger value="comments" data-testid="tab-comments">
              Comments
              {count > 0 && (
                <span
                  className="ml-1.5 rounded-full bg-accent-soft px-1.5 text-[11px] text-accent-soft-fg"
                  data-testid="comment-count"
                >
                  {count}
                </span>
              )}
            </TabsTrigger>
            {target.kind === 'document' && <TabsTrigger value="versions">Versions</TabsTrigger>}
          </TabsList>
          <TabsContent value="properties">{props(q)}</TabsContent>
          <TabsContent value="comments">
            <CommentThread target={target} />
          </TabsContent>
          {target.kind === 'document' && (
            <TabsContent value="versions">
              <VersionsPanel
                documentId={target.id}
                permissions={(q.data?.your_permissions ?? []) as never}
              />
            </TabsContent>
          )}
        </Tabs>
      )}
      {!target && (
        <div className="p-4">
          <p className="text-[13px] text-muted">
            {selectionCount > 1
              ? `${selectionCount} items selected. Select a single item to see its details.`
              : 'Select an item to see its details.'}
          </p>
        </div>
      )}
    </aside>
  );
}

function props(q: ReturnType<typeof useProperties>) {
  return (
    <div>
      {q.isPending ? (
        <Skeleton className="h-40" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} className="py-4" />
      ) : (
        (() => {
          const p = q.data;
          return (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
              <Row k="Name">{p.name}</Row>
              <Row k="Type">{p.kind === 'folder' ? 'Folder' : (p.type ?? 'File')}</Row>
              {p.kind === 'document' && <Row k="Size">{formatBytes(p.size_bytes)}</Row>}
              {p.status && p.status !== 'available' && <Row k="Status">{p.status}</Row>}
              <Row k="Location">
                {p.location.length ? <PathTrail segments={p.location} size="sm" /> : 'Top level'}
              </Row>
              <Row k="Created">
                {formatDateTime(p.created_at)}
                {p.created_by && ` by ${p.created_by.display_name ?? p.created_by.email}`}
              </Row>
              <Row k="Modified">
                {formatDateTime(p.updated_at)}
                {p.updated_by && ` by ${p.updated_by.display_name ?? p.updated_by.email}`}
              </Row>
              {p.classification && <Row k="Classification">{p.classification}</Row>}
              {p.kind === 'document' && p.current_version_number != null && (
                <Row k="Version">
                  v{p.current_version_number}
                  {p.version_count != null && ` of ${p.version_count}`}
                </Row>
              )}
              {p.kind === 'folder' && (
                <Row k="Contains">
                  {p.visible_documents ?? 0} file{p.visible_documents === 1 ? '' : 's'},{' '}
                  {p.visible_folders ?? 0} folder
                  {p.visible_folders === 1 ? '' : 's'}
                  {p.visible_size_bytes != null && ` (${formatBytes(p.visible_size_bytes)})`}
                  <span className="block text-xs text-muted">
                    Counts cover only what you can see
                    {p.truncated ? '; this folder is large so counts are partial' : ''}.
                  </span>
                </Row>
              )}
              {p.lock && (
                <Row k="Check-out">
                  <span className="inline-flex items-center gap-1">
                    <Lock className="size-3" aria-hidden />
                    {p.lock.is_mine
                      ? 'You'
                      : (p.lock.locked_by.display_name ?? p.lock.locked_by.email)}{' '}
                    since {formatDateTime(p.lock.locked_at)}
                  </span>
                </Row>
              )}
              {(p.protection.legal_hold || p.protection.retention_until) && (
                <Row k="Protection">
                  {p.protection.legal_hold && <Badge tone="danger">Legal hold</Badge>}{' '}
                  {p.protection.retention_until && (
                    <Badge tone="warn">
                      Retained until {formatDateTime(p.protection.retention_until)}
                    </Badge>
                  )}
                </Row>
              )}
              <Row k="Access">
                {p.active_shares == null && p.acl_entries == null ? (
                  <span className="text-muted">
                    Sharing details are visible to people who manage access.
                  </span>
                ) : (
                  <>
                    {p.active_shares != null &&
                      `${p.active_shares} active share${p.active_shares === 1 ? '' : 's'}`}
                    {p.active_shares != null && p.acl_entries != null && ', '}
                    {p.acl_entries != null &&
                      `${p.acl_entries} permission grant${p.acl_entries === 1 ? '' : 's'}`}
                  </>
                )}
              </Row>
              <Row k="Your permissions">
                <span className="flex flex-wrap gap-1">
                  {p.your_permissions.map((a) => (
                    <Badge key={a}>{actionLabel(a)}</Badge>
                  ))}
                </span>
              </Row>
            </dl>
          );
        })()
      )}
    </div>
  );
}
