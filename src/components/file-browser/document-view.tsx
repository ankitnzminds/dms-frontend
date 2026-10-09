'use client';

import {
  ClipboardCheck,
  Download,
  FileSignature,
  Loader2,
  Share2,
  ShieldAlert,
  Undo2,
  Upload,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { AuditTable } from '@/components/admin/audit-table';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { PathTrail } from '@/components/navigation/path-trail';
import { PreviewPanel } from '@/components/file-preview/preview-panel';
import { ResourceShares } from '@/components/sharing/resource-shares';
import { RequestSignatureDialog } from '@/components/signatures/request-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DisabledReason } from '@/components/ui/tooltip';
import { SubmitApprovalDialog } from '@/components/workflows/submit-approval-dialog';
import { useAuditEvents } from '@/features/admin/hooks';
import { useMe } from '@/features/auth/session';
import {
  itemAvailability,
  isPreviewableType,
  type ActionItem,
} from '@/features/files/availability';
import { useDocument, useRestoreItem } from '@/features/files/hooks';
import { useProtection } from '@/features/governance/hooks';
import { useOrganization } from '@/features/sharing/hooks';
import { signatureUnavailableReason, useSignatureCapabilities } from '@/features/signatures/hooks';
import { useUploads } from '@/features/upload/upload-manager';
import { friendlyMessage, type Document } from '@/lib/api-client';
import { can, canReadAudit, isAdminRole } from '@/lib/permissions';
import { ApprovalsPanel, DetailsCard, ProcessingCard, SignaturesPanel } from './document-panels';
import { StatusChip } from './file-bits';
import { ItemActionsProvider, ItemMenu, useItemActions } from './item-actions';
import { MetadataForm } from './metadata-form';
import { deleteBlockReason, ProtectionBadges } from './protection-badges';
import { VersionsPanel } from './versions-panel';

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

function Toolbar({ doc }: { doc: Document }) {
  const { run } = useItemActions();
  const { engine } = useUploads();
  const { data: me } = useMe();
  const org = useOrganization();
  const caps = useSignatureCapabilities();
  const protection = useProtection('document', doc.id);
  const input = useRef<HTMLInputElement>(null);
  const [approval, setApproval] = useState(false);
  const [signature, setSignature] = useState(false);
  const item = docToItem(doc);
  const av = itemAvailability(item);

  const blocked = ((org.data?.settings as { share_blocked_classifications?: string[] } | undefined)
    ?.share_blocked_classifications ?? []) as string[];
  const shareReason = !av.share.enabled
    ? av.share.reason
    : blocked.includes(doc.classification)
      ? `Documents classified "${doc.classification}" cannot be shared.`
      : null;
  const uploadReason = !can(doc.permissions, 'upload_version')
    ? 'You do not have permission to upload new versions.'
    : doc.status === 'processing'
      ? 'Wait for the current version to finish scanning.'
      : null;
  const approvalReason =
    doc.status !== 'available'
      ? 'Only available documents can be submitted for approval.'
      : !can(doc.permissions, 'view')
        ? 'You do not have access to submit this document.'
        : null;
  const isPdf = doc.current_version?.content_type === 'application/pdf';
  const sigReason =
    doc.status !== 'available'
      ? 'Only available documents can be sent for signature.'
      : !isPdf
        ? 'Only PDF documents can be sent for signature.'
        : signatureUnavailableReason(caps.data, isAdminRole(me?.role));

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
      <DisabledReason reason={shareReason}>
        <Button disabled={!!shareReason} onClick={() => run('share', item)}>
          <Share2 /> Share
        </Button>
      </DisabledReason>
      <DisabledReason reason={uploadReason}>
        <Button disabled={!!uploadReason} onClick={() => input.current?.click()}>
          <Upload /> Upload new version
        </Button>
      </DisabledReason>
      <DisabledReason reason={approvalReason}>
        <Button disabled={!!approvalReason} onClick={() => setApproval(true)}>
          <ClipboardCheck /> Submit for approval
        </Button>
      </DisabledReason>
      <DisabledReason reason={sigReason}>
        <Button disabled={!!sigReason} onClick={() => setSignature(true)}>
          <FileSignature /> Request signature
        </Button>
      </DisabledReason>
      <ItemMenu
        item={item}
        hide={['download', 'share', 'open']}
        overrides={
          deleteBlockReason(protection.data) ? { delete: deleteBlockReason(protection.data)! } : {}
        }
      />
      {approval && (
        <SubmitApprovalDialog
          documentId={doc.id}
          documentName={doc.name}
          open
          onOpenChange={setApproval}
        />
      )}
      {signature && (
        <RequestSignatureDialog
          documentId={doc.id}
          documentName={doc.name}
          open
          onOpenChange={setSignature}
        />
      )}
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
  const protection = useProtection('document', documentId);
  const tab = useSearchParams().get('tab') ?? 'overview';

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
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate">{doc.name}</span> <StatusChip status={doc.status} />
            <ProtectionBadges protection={protection.data} />
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
      <Tabs key={tab} defaultValue={tab}>
        <TabsList aria-label="Document sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="sharing">Sharing</TabsTrigger>
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
          <TabsTrigger value="signatures">Signatures</TabsTrigger>
          {showActivity && <TabsTrigger value="activity">Activity</TabsTrigger>}
        </TabsList>
        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Panel className="min-w-0 self-start p-3">
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
            <div className="grid content-start gap-4">
              <Panel className="p-4">
                <h2 className="mb-3 text-sm font-semibold">Details</h2>
                <DetailsCard doc={doc} />
              </Panel>
              <Panel className="p-4">
                <h2 className="mb-3 text-sm font-semibold">Metadata</h2>
                <MetadataForm doc={doc} />
              </Panel>
              <Panel className="p-4">
                <h2 className="mb-3 text-sm font-semibold">Processing</h2>
                <ProcessingCard doc={doc} />
              </Panel>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="versions">
          <VersionsPanel documentId={doc.id} permissions={doc.permissions} />
        </TabsContent>
        <TabsContent value="sharing">
          <ResourceShares kind="document" id={doc.id} canShare={can(doc.permissions, 'share')} />
        </TabsContent>
        <TabsContent value="approvals">
          <ApprovalsPanel doc={doc} />
        </TabsContent>
        <TabsContent value="signatures">
          <SignaturesPanel doc={doc} />
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
