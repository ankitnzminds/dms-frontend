'use client';

import { ClipboardCheck, FileSignature, Workflow } from 'lucide-react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Thumbnail } from '@/components/file-preview/thumbnail';
import { RunCard } from '@/components/workflows/run-card';
import { SignatureRequestCard } from '@/components/signatures/request-card';
import { RequestSignatureDialog } from '@/components/signatures/request-dialog';
import { SubmitApprovalDialog } from '@/components/workflows/submit-approval-dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { DisabledReason } from '@/components/ui/tooltip';
import { useMe } from '@/features/auth/session';
import { useProcessing, useUpdateDocumentMeta } from '@/features/files/hooks';
import {
  signatureUnavailableReason,
  useDocumentSignatures,
  useSignatureCapabilities,
} from '@/features/signatures/hooks';
import { useUpdateOrganization } from '@/features/admin/hooks';
import { useOrganization } from '@/features/sharing/hooks';
import { useDocumentRuns, useWorkflows } from '@/features/workflows/hooks';
import {
  CLASSIFICATIONS,
  friendlyMessage,
  isApiError,
  type Classification,
  type Document,
} from '@/lib/api-client';
import { formatBytes, formatDateTime } from '@/lib/format';
import { can, isAdminRole } from '@/lib/permissions';
import { StatusChip } from './file-bits';
import { Badge } from '@/components/ui/badge';

export function DetailsCard({ doc }: { doc: Document }) {
  const meta = useUpdateDocumentMeta();
  const v = doc.current_version;
  const rows: [string, React.ReactNode][] = [
    ['Name', doc.name],
    [
      'Status',
      doc.status === 'available' ? (
        <Badge tone="ok">Available</Badge>
      ) : (
        <StatusChip status={doc.status} />
      ),
    ],
    ['Type', v?.content_type ?? '-'],
    ['Size', formatBytes(v?.size_bytes)],
    ['Version', `v${doc.latest_version_number}`],
    ['Created', formatDateTime(doc.created_at)],
    ['Modified', formatDateTime(doc.updated_at)],
  ];
  const canClassify = can(doc.permissions, 'manage_access');
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
      {rows.map(([k, val]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words">{val}</dd>
        </div>
      ))}
      <dt className="text-muted">Classification</dt>
      <dd>
        <DisabledReason
          reason={
            canClassify ? null : 'Changing the classification needs the manage access permission.'
          }
        >
          <Select
            aria-label="Classification"
            className="h-7 w-40 text-[13px]"
            value={doc.classification}
            disabled={!canClassify || meta.isPending}
            onChange={(e) =>
              meta.mutate(
                {
                  id: doc.id,
                  classification: e.target.value as Classification,
                  expectedRowVersion: doc.row_version,
                },
                {
                  onSuccess: () => toast.success(`Classification set to ${e.target.value}`),
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
            {CLASSIFICATIONS.map((c) => (
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

/** Text-extraction status and thumbnail (GET /documents/{id}/processing + thumbnail variant). */
export function ProcessingCard({ doc }: { doc: Document }) {
  const q = useProcessing(doc.id, true);
  if (q.isPending) return <p className="text-xs text-muted">Loading processing status…</p>;
  if (q.isError) return <p className="text-xs text-muted">Processing details are not available.</p>;
  const p = q.data;
  return (
    <div className="grid gap-3" data-testid="processing-card">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        <dt className="text-muted">Text indexing</dt>
        <dd data-testid="text-status">{p.text_status ?? 'Not started'}</dd>
        {typeof p.text_characters === 'number' && p.text_characters > 0 && (
          <>
            <dt className="text-muted">Indexed text</dt>
            <dd>
              {p.text_characters.toLocaleString()} characters
              {p.text_truncated ? ' (truncated)' : ''}
            </dd>
          </>
        )}
        <dt className="text-muted">Thumbnail</dt>
        <dd>{p.has_thumbnail ? 'Ready' : 'None'}</dd>
      </dl>
      {p.has_thumbnail && doc.status === 'available' && (
        <Thumbnail documentId={doc.id} name={doc.name} className="max-h-40 w-auto" />
      )}
    </div>
  );
}

/** Why a document cannot go to approval right now (null = it can). Shared by the toolbar and the tab. */
export function approvalBlockReason(doc: Document): string | null {
  if (doc.status !== 'available') return 'Only available documents can be submitted for approval.';
  if (!can(doc.permissions, 'view')) return 'You do not have access to submit this document.';
  return null;
}

/** Why a signature cannot be requested (null = it can): the feature must be on; non-PDF files need built-in signing. */
export function signatureBlockReason(
  doc: Document,
  caps: Parameters<typeof signatureUnavailableReason>[0],
  admin: boolean,
): string | null {
  if (doc.status !== 'available') return 'Only available documents can be sent for signature.';

  return signatureUnavailableReason(caps, admin);
}

export function ApprovalsPanel({ doc }: { doc: Document }) {
  const q = useDocumentRuns(doc.id);
  const { data: me } = useMe();
  const admin = isAdminRole(me?.role);
  const workflows = useWorkflows(false);
  const [submitting, setSubmitting] = useState(false);
  const reason = approvalBlockReason(doc);
  const none = (workflows.data ?? []).filter((w) => !w.archived).length === 0;
  const header = (
    <div className="flex flex-wrap items-center gap-3">
      <DisabledReason reason={reason}>
        <Button
          variant="primary"
          disabled={!!reason}
          onClick={() => setSubmitting(true)}
          data-testid="approvals-submit"
        >
          <ClipboardCheck /> Submit for approval
        </Button>
      </DisabledReason>
      {!reason && workflows.isSuccess && none && (
        <p className="text-xs text-muted" data-testid="no-workflows">
          No approval workflow exists yet.{' '}
          {admin ? (
            <Link href="/admin/workflows" className="text-accent hover:underline">
              Create one
            </Link>
          ) : (
            'Ask an administrator to create one.'
          )}
        </p>
      )}
    </div>
  );
  const dialog = submitting && (
    <SubmitApprovalDialog
      folderId={doc.folder_id}
      documentId={doc.id}
      documentName={doc.name}
      open
      onOpenChange={setSubmitting}
    />
  );
  if (q.isPending) return <SkeletonRows rows={2} label="Loading approvals" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data.length === 0)
    return (
      <div className="grid gap-4">
        {header}
        <EmptyState
          icon={Workflow}
          title="No approvals yet"
          description="Submit this document to reviewers; their decisions appear here."
        />
        {dialog}
      </div>
    );
  return (
    <div className="grid gap-3">
      {header}
      {[...q.data]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((r) => (
          <RunCard
            key={r.id}
            run={r}
            canManage={r.started_by.id === me?.user_id || isAdminRole(me?.role)}
          />
        ))}
      {dialog}
    </div>
  );
}

export function SignaturesPanel({ doc }: { doc: Document }) {
  const q = useDocumentSignatures(doc.id);
  const { data: me } = useMe();
  const caps = useSignatureCapabilities();
  const [requesting, setRequesting] = useState(false);
  const admin = isAdminRole(me?.role);
  const org = useOrganization();
  const updateOrg = useUpdateOrganization();
  const qc = useQueryClient();
  const reason = signatureBlockReason(doc, caps.data, admin);
  // E-signature exists on this server but the organization has not turned it on: an administrator can
  // do it right here (same setting as Administration > Settings).
  const canEnable = admin && !!caps.data?.available && !caps.data.enabled && !!org.data;
  const header = (
    <div className="grid gap-1">
      <DisabledReason reason={reason}>
        <Button
          variant="primary"
          className="justify-self-start"
          disabled={!!reason}
          onClick={() => setRequesting(true)}
          data-testid="signatures-request"
        >
          <FileSignature /> Request signature
        </Button>
      </DisabledReason>
      {reason && (
        <p className="text-xs text-muted" data-testid="signature-reason">
          {reason}
        </p>
      )}
      {canEnable && (
        <Button
          variant="secondary"
          className="justify-self-start"
          disabled={updateOrg.isPending}
          data-testid="signatures-enable"
          onClick={() =>
            updateOrg.mutate(
              {
                settings: {
                  ...(org.data!.settings as Record<string, unknown>),
                  signatures_enabled: true,
                },
              },
              {
                onSuccess: () => {
                  void qc.invalidateQueries({ queryKey: ['signature-capabilities'] });
                  toast.success('E-signature is turned on for your organization');
                },
                onError: (e) => toast.error(friendlyMessage(e)),
              },
            )
          }
        >
          Turn on e-signature
        </Button>
      )}
    </div>
  );
  const dialog = requesting && (
    <RequestSignatureDialog
      isPdf={doc.current_version?.content_type === 'application/pdf'}
      folderId={doc.folder_id}
      documentId={doc.id}
      documentName={doc.name}
      open
      onOpenChange={setRequesting}
    />
  );
  if (q.isPending) return <SkeletonRows rows={2} label="Loading signature requests" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data.length === 0)
    return (
      <div className="grid gap-4">
        {header}
        <EmptyState
          icon={FileSignature}
          title="No signature requests"
          description="Request a signature on a PDF; the status of every signer appears here."
        />
        {dialog}
      </div>
    );
  return (
    <div className="grid gap-3">
      {header}
      {[...q.data]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((r) => (
          <SignatureRequestCard
            key={r.id}
            initial={r}
            showDocumentLink={false}
            canCancel={r.requested_by.id === me?.user_id || isAdminRole(me?.role)}
          />
        ))}
      {dialog}
    </div>
  );
}
