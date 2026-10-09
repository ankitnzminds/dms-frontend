'use client';

import { FileSignature, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { Thumbnail } from '@/components/file-preview/thumbnail';
import { RunCard } from '@/components/workflows/run-card';
import { SignatureRequestCard } from '@/components/signatures/request-card';
import { Select } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { DisabledReason } from '@/components/ui/tooltip';
import { useMe } from '@/features/auth/session';
import { useProcessing, useUpdateDocumentMeta } from '@/features/files/hooks';
import { useDocumentSignatures } from '@/features/signatures/hooks';
import { useDocumentRuns } from '@/features/workflows/hooks';
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

export function ApprovalsPanel({ doc }: { doc: Document }) {
  const q = useDocumentRuns(doc.id);
  const { data: me } = useMe();
  if (q.isPending) return <SkeletonRows rows={2} label="Loading approvals" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data.length === 0)
    return (
      <EmptyState
        icon={Workflow}
        title="No approvals yet"
        description="Use Submit for approval to send this document to reviewers."
      />
    );
  return (
    <div className="grid gap-3">
      {[...q.data]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((r) => (
          <RunCard
            key={r.id}
            run={r}
            canManage={r.started_by.id === me?.user_id || isAdminRole(me?.role)}
          />
        ))}
    </div>
  );
}

export function SignaturesPanel({ doc }: { doc: Document }) {
  const q = useDocumentSignatures(doc.id);
  const { data: me } = useMe();
  if (q.isPending) return <SkeletonRows rows={2} label="Loading signature requests" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data.length === 0)
    return (
      <EmptyState
        icon={FileSignature}
        title="No signature requests"
        description="Use Request signature on a PDF to collect signatures."
      />
    );
  return (
    <div className="grid gap-3">
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
    </div>
  );
}
