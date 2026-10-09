'use client';

import { Download, Share2, ShieldAlert, Upload, Loader2, Undo2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { AuditTable } from '@/components/admin/audit-table';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { PathTrail } from '@/components/navigation/path-trail';
import { PreviewPanel } from '@/components/file-preview/preview-panel';
import { ResourceShares } from '@/components/sharing/resource-shares';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DisabledReason } from '@/components/ui/tooltip';
import { useAuditEvents } from '@/features/admin/hooks';
import { useMe } from '@/features/auth/session';
import {
  itemAvailability,
  isPreviewableType,
  type ActionItem,
} from '@/features/files/availability';
import { useDocument, useRestoreItem, useUpdateDocumentMeta } from '@/features/files/hooks';
import { useUploads } from '@/features/upload/upload-manager';
import { friendlyMessage, isApiError, type Document } from '@/lib/api-client';
import { formatBytes, formatDateTime } from '@/lib/format';
import { can, canReadAudit } from '@/lib/permissions';
import { ItemActionsProvider, ItemMenu, useItemActions } from './item-actions';
import { StatusChip } from './file-bits';
import { VersionsPanel } from './versions-panel';

const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'];

export function docToItem(d: Document): ActionItem {
  return {
    kind: 'document',
    id: d.id,
    name: d.name,
    permissions: d.permissions,
    starred: d.starred,
    status: d.status,
    content_type: d.current_version?.content_type,
  };
}

function StatusBanner({ doc }: { doc: Document }) {
  if (doc.status === 'available') return null;
  const map = {
    processing: [
      'info',
      'Scanning for malware',
      'This file becomes available after the scan finishes. This page updates automatically.',
    ],
    quarantined: [
      'danger',
      'Quarantined',
      'The scanner flagged this file. It cannot be downloaded or previewed.',
    ],
    failed: [
      'danger',
      'Processing failed',
      'This upload could not be completed. Upload the file again.',
    ],
  } as const;
  const [tone, title, body] = map[doc.status];
  return (
    <div
      role="status"
      aria-live="polite"
      className={`mb-4 flex items-start gap-3 rounded-lg px-4 py-3 text-[13px] ${tone === 'info' ? 'bg-info-soft text-info' : 'bg-danger-soft text-danger'}`}
    >
      {doc.status === 'processing' ? (
        <Loader2 className="mt-0.5 size-4 animate-spin" aria-hidden />
      ) : (
        <ShieldAlert className="mt-0.5 size-4" aria-hidden />
      )}
      <div>
        <p className="font-semibold">{title}</p>
        <p>{body}</p>
      </div>
    </div>
  );
}

function Details({ doc }: { doc: Document }) {
  const meta = useUpdateDocumentMeta();
  const v = doc.current_version;
  const rows: [string, React.ReactNode][] = [
    ['Name', doc.name],
    ['Status', <StatusChip key="s" status={doc.status} />],
    ['Type', v?.content_type ?? '-'],
    ['Size', formatBytes(v?.size_bytes)],
    ['Version', `v${doc.latest_version_number}`],
    ['Created', formatDateTime(doc.created_at)],
    ['Modified', formatDateTime(doc.updated_at)],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
      {rows.map(([k, val]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words">
            {k === 'Status' && doc.status === 'available' ? (
              <Badge tone="ok">Available</Badge>
            ) : (
              val
            )}
          </dd>
        </div>
      ))}
      <dt className="text-muted">Classification</dt>
      <dd>
        <DisabledReason
          reason={
            can(doc.permissions, 'manage_access')
              ? null
              : 'Changing the classification needs the manage access permission.'
          }
        >
          <Select
            aria-label="Classification"
            className="h-7 w-40 text-[13px]"
            value={doc.classification}
            disabled={!can(doc.permissions, 'manage_access') || meta.isPending}
            onChange={(e) =>
              meta.mutate(
                { id: doc.id, classification: e.target.value, expectedRowVersion: doc.row_version },
                {
                  onSuccess: () => toast.success('Classification updated'),
                  onError: (er) =>
                    toast.error(
                      isApiError(er) && er.code === 'stale_version'
                        ? 'This document changed. Reload and try again.'
                        : friendlyMessage(er),
                    ),
                },
              )
            }
          >
            {[...new Set([doc.classification, ...CLASSIFICATIONS])].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </DisabledReason>
      </dd>
    </dl>
  );
}

function Toolbar({ doc }: { doc: Document }) {
  const { run } = useItemActions();
  const { engine } = useUploads();
  const input = useRef<HTMLInputElement>(null);
  const item = docToItem(doc);
  const av = itemAvailability(item);
  const uploadReason = !can(doc.permissions, 'upload_version')
    ? 'You do not have permission to upload new versions.'
    : doc.status === 'processing'
      ? 'Wait for the current version to finish scanning.'
      : null;
  return (
    <>
      <input
        ref={input}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose the new version file"
        data-testid="version-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) engine.enqueueVersion(f, doc.id, doc.latest_version_number);
          e.target.value = '';
        }}
      />
      <DisabledReason reason={av.download.enabled ? null : av.download.reason}>
        <Button
          variant="primary"
          disabled={!av.download.enabled}
          onClick={() => run('download', item)}
        >
          <Download /> Download
        </Button>
      </DisabledReason>
      <DisabledReason reason={av.share.enabled ? null : av.share.reason}>
        <Button disabled={!av.share.enabled} onClick={() => run('share', item)}>
          <Share2 /> Share
        </Button>
      </DisabledReason>
      <DisabledReason reason={uploadReason}>
        <Button disabled={!!uploadReason} onClick={() => input.current?.click()}>
          <Upload /> Upload new version
        </Button>
      </DisabledReason>
      <ItemMenu item={item} hide={['download', 'share', 'open']} />
    </>
  );
}

function ActivityTab({ id }: { id: string }) {
  const [offset, setOffset] = useState(0);
  const q = useAuditEvents({ resource_type: 'document', resource_id: id, limit: 20, offset });
  return (
    <Panel>
      <AuditTable
        data={q.data}
        isLoading={q.isPending}
        error={q.error}
        onRetry={() => q.refetch()}
        onOffsetChange={setOffset}
        emptyText="Nothing has happened to this document yet."
      />
    </Panel>
  );
}

export function DocumentView({ documentId }: { documentId: string }) {
  const q = useDocument(documentId);
  const { data: me } = useMe();
  const restore = useRestoreItem();

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isPending)
    return (
      <div className="grid gap-3" role="status" aria-label="Loading document">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-72" />
      </div>
    );

  const doc = q.data;
  const v = doc.current_version;
  const av = itemAvailability(docToItem(doc));
  const showActivity = canReadAudit(me);

  return (
    <ItemActionsProvider currentFolderId={doc.folder_id}>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span className="truncate">{doc.name}</span> <StatusChip status={doc.status} />
          </span>
        }
        trail={<PathTrail segments={doc.breadcrumb} />}
        actions={<Toolbar doc={doc} />}
      />
      {doc.deleted_at && (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-warn-soft px-4 py-3 text-[13px] text-warn"
        >
          This document is in the trash.
          <Button
            size="sm"
            disabled={!can(doc.permissions, 'restore') || restore.isPending}
            onClick={() =>
              restore.mutate(
                { kind: 'document', id: doc.id },
                {
                  onSuccess: () => toast.success('Restored'),
                  onError: (e) => toast.error(friendlyMessage(e)),
                },
              )
            }
          >
            <Undo2 /> Restore
          </Button>
        </div>
      )}
      <StatusBanner doc={doc} />
      <Tabs defaultValue="overview">
        <TabsList aria-label="Document sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="sharing">Sharing</TabsTrigger>
          {showActivity && <TabsTrigger value="activity">Activity</TabsTrigger>}
        </TabsList>
        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Panel className="min-w-0 p-3">
              {doc.status === 'available' &&
              v &&
              av.preview.enabled &&
              isPreviewableType(v.content_type) ? (
                <PreviewPanel
                  documentId={doc.id}
                  contentType={v.content_type}
                  name={doc.name}
                  canDownload={av.download.enabled}
                />
              ) : (
                <p className="px-2 py-10 text-center text-[13px] text-muted">
                  {av.preview.reason ?? 'Preview is not available for this file.'}
                </p>
              )}
            </Panel>
            <Panel className="h-fit p-4">
              <h2 className="mb-3 text-sm font-semibold">Details</h2>
              <Details doc={doc} />
            </Panel>
          </div>
        </TabsContent>
        <TabsContent value="versions">
          <VersionsPanel documentId={doc.id} permissions={doc.permissions} />
        </TabsContent>
        <TabsContent value="sharing">
          <ResourceShares kind="document" id={doc.id} canShare={can(doc.permissions, 'share')} />
        </TabsContent>
        {showActivity && (
          <TabsContent value="activity">
            <ActivityTab id={doc.id} />
          </TabsContent>
        )}
      </Tabs>
    </ItemActionsProvider>
  );
}
