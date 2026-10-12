'use client';

import {
  Bot,
  ClipboardCheck,
  Download,
  FileSignature,
  Loader2,
  Lock,
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
import { CommentCount, CommentThread } from '@/components/comments/comment-thread';
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
import { lockErrorText, useLockDocument, useProperties } from '@/features/explorer/hooks';
import { useChatLauncher } from '@/features/chat/launcher';
import { RequestAccessDialog } from '@/features/requests/request-access-dialog';
import { useOrganization } from '@/features/sharing/hooks';
import { signatureUnavailableReason, useSignatureCapabilities } from '@/features/signatures/hooks';
import { useUploads } from '@/features/upload/upload-manager';
import { friendlyMessage, type Document } from '@/lib/api-client';
import { can, canReadAudit, isAdminRole } from '@/lib/permissions';
import {
  ApprovalsPanel,
  approvalBlockReason,
  DetailsCard,
  ProcessingCard,
  SignaturesPanel,
  signatureBlockReason,
} from './document-panels';
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
  const [requestOpen, setRequestOpen] = useState(false);
  const chat = useChatLauncher();
  const props = useProperties('document', doc.id);
  const lockMut = useLockDocument();
  const lock = props.data?.lock ?? null;
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
  const approvalReason = approvalBlockReason(doc);
  const sigReason = signatureBlockReason(doc, caps.data, isAdminRole(me?.role));

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
      {lock ? (
        <DisabledReason
          reason={
            lock.is_mine || can(doc.permissions, 'administer')
              ? null
              : 'Checked out by someone else. Only an administrator can break the lock.'
          }
        >
          <Button
            disabled={!lock.is_mine && !can(doc.permissions, 'administer')}
            onClick={() =>
              lockMut.mutate(
                { id: doc.id, lock: false },
                {
                  onSuccess: () => toast.success('Checked in'),
                  onError: (e) => toast.error(lockErrorText(e) ?? friendlyMessage(e)),
                },
              )
            }
          >
            <Lock /> {lock.is_mine ? 'Check in' : 'Check in (break lock)'}
          </Button>
        </DisabledReason>
      ) : (
        can(doc.permissions, 'upload_version') && (
          <Button
            onClick={() =>
              lockMut.mutate(
                { id: doc.id, lock: true },
                {
                  onSuccess: () => toast.success('Checked out'),
                  onError: (e) => toast.error(lockErrorText(e) ?? friendlyMessage(e)),
                },
              )
            }
          >
            <Lock /> Check out
          </Button>
        )
      )}
      {(!can(doc.permissions, 'download') || !can(doc.permissions, 'view')) && (
        <Button onClick={() => setRequestOpen(true)}>Request access</Button>
      )}
      {requestOpen && (
        <RequestAccessDialog
          kind="document"
          id={doc.id}
          name={doc.name}
          have={doc.permissions}
          onClose={() => setRequestOpen(false)}
        />
      )}
      {chat.enabled && (
        <Button
          onClick={() => chat.open({ documentId: doc.id, label: doc.name })}
          data-testid="ask-about"
        >
          <Bot /> Ask about this file
        </Button>
      )}
      <ItemMenu
        item={item}
        hide={['download', 'share', 'open']}
        overrides={
          deleteBlockReason(protection.data) ? { delete: deleteBlockReason(protection.data)! } : {}
        }
      />
      {approval && (
        <SubmitApprovalDialog
          folderId={doc.folder_id}
          documentId={doc.id}
          documentName={doc.name}
          open
          onOpenChange={setApproval}
        />
      )}
      {signature && (
        <RequestSignatureDialog
          isPdf={doc.current_version?.content_type === 'application/pdf'}
          folderId={doc.folder_id}
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
  const org = useOrganization();
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
          <TabsTrigger value="comments" data-testid="tab-comments">
            Comments
            <CommentCount kind="document" id={doc.id} />
          </TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="sharing">Sharing</TabsTrigger>
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
          <TabsTrigger value="signatures">Signatures</TabsTrigger>
          {showActivity && <TabsTrigger value="activity">Activity</TabsTrigger>}
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          {/* The preview gets the whole page; Details and Metadata are their own tabs. */}
          <Panel className="min-w-0 p-3">
            {doc.status === 'available' &&
            v &&
            av.preview.enabled &&
            isPreviewableType(v.content_type, doc.name) ? (
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
        </TabsContent>
        <TabsContent value="details">
          <div className="grid content-start gap-4 lg:grid-cols-2">
            <Panel className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Details</h2>
              <DetailsCard doc={doc} />
            </Panel>
            <Panel className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Processing</h2>
              <ProcessingCard doc={doc} />
            </Panel>
          </div>
        </TabsContent>
        <TabsContent value="metadata">
          <Panel className="max-w-3xl p-4">
            <h2 className="mb-3 text-sm font-semibold">Metadata</h2>
            <MetadataForm doc={doc} />
          </Panel>
        </TabsContent>
        <TabsContent value="comments">
          <CommentThread target={{ kind: 'document', id: doc.id }} />
        </TabsContent>
        <TabsContent value="versions">
          <VersionsPanel documentId={doc.id} permissions={doc.permissions} />
        </TabsContent>
        <TabsContent value="sharing">
          <ResourceShares
            kind="document"
            id={doc.id}
            name={doc.name}
            canShare={can(doc.permissions, 'share')}
            shareBlockedReason={
              (
                (org.data?.settings as { share_blocked_classifications?: string[] } | undefined)
                  ?.share_blocked_classifications ?? []
              ).includes(doc.classification)
                ? `Documents classified "${doc.classification}" cannot be shared.`
                : null
            }
          />
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
