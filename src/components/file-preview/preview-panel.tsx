'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { Download, Pencil } from 'lucide-react';
import { useState } from 'react';
import { DocxFallback } from '@/components/preview/docx-fallback';
import { ImageViewer } from '@/components/preview/image-viewer';
import { OfficeViewer } from '@/components/preview/office-viewer';
import { TextEditor } from '@/components/preview/text-editor';
import { TextViewer } from '@/components/preview/text-viewer';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { downloadDocument, requestDownloadUrl } from '@/features/files/download';
import { useDocument } from '@/features/files/hooks';
import { useOfficeStatus } from '@/features/preview/office';
import { extensionOf, previewKind } from '@/features/preview/kinds';
import { isApiError } from '@/lib/api-client';
import { can } from '@/lib/permissions';

// pdf.js touches `document`/`DOMMatrix` at import time and weighs ~1 MB: load it only in the browser, on demand.
const PdfViewer = dynamic(
  () => import('@/components/preview/pdf-viewer').then((m) => m.PdfViewer),
  {
    ssr: false,
    loading: () => <Skeleton className="h-96 w-full" />,
  },
);

interface Props {
  documentId: string;
  versionNumber?: number | null;
  contentType: string;
  name: string;
  canDownload: boolean;
}

function NoPreview({ props, reason }: { props: Props; reason: string }) {
  return (
    <EmptyState
      title="No preview for this file"
      description={reason}
      action={
        props.canDownload && (
          <Button
            variant="primary"
            onClick={() => void downloadDocument(props.documentId, props.versionNumber)}
          >
            <Download /> Download
          </Button>
        )
      }
    />
  );
}

/** Office documents: the office suite when available, otherwise an honest fallback. */
function OfficePreview(props: Props) {
  const status = useOfficeStatus();
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const isDocx = extensionOf(props.name) === 'docx';

  if (props.versionNumber != null)
    return (
      <NoPreview
        props={props}
        reason="Older versions can be downloaded; the office viewer opens the current version."
      />
    );
  if (status.isPending) return <Skeleton className="h-96 w-full" />;
  if (status.data?.available && !unavailable)
    return (
      <OfficeViewer
        documentId={props.documentId}
        name={props.name}
        onUnavailable={setUnavailable}
      />
    );
  if (isDocx && props.canDownload)
    return <DocxFallback documentId={props.documentId} name={props.name} />;
  return (
    <NoPreview
      props={props}
      reason={
        unavailable ??
        'The office viewer is not configured on this server, so this file type cannot be previewed here.'
      }
    />
  );
}

/** Kinds that stream bytes through a fresh short-lived inline ticket (never cached). */
function InlinePreview(props: Props & { kind: 'pdf' | 'image' | 'text' | 'csv' }) {
  const q = useQuery({
    queryKey: ['preview-url', props.documentId, props.versionNumber ?? 'current'],
    queryFn: () =>
      requestDownloadUrl(props.documentId, { versionNumber: props.versionNumber, inline: true }),
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    retry: false,
  });
  if (q.isPending) return <Skeleton className="h-96 w-full" />;
  if (q.isError) {
    if (isApiError(q.error) && q.error.code === 'not_previewable')
      return <NoPreview props={props} reason="Download the file to view it." />;
    return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  }
  const { url } = q.data;
  if (props.kind === 'pdf')
    return (
      <PdfViewer
        url={url}
        documentId={props.documentId}
        name={props.name}
        canDownload={props.canDownload}
      />
    );
  if (props.kind === 'image') return <ImageViewer url={url} name={props.name} />;
  return <TextViewer url={url} kind={props.kind} name={props.name} />;
}

/**
 * Text, Markdown and CSV: the light viewer, plus "Edit" when the office suite can edit this type and the
 * user may. Editing runs in the office editor; every save is stored as a new version (the previous ones
 * stay), and "Done editing" returns here showing the newest version.
 */
function EditableTextPreview(props: Props & { kind: 'text' | 'csv' }) {
  const status = useOfficeStatus();
  const doc = useDocument(props.documentId);
  const qc = useQueryClient();
  const [mode, setMode] = useState<'view' | 'quick' | 'office'>('view');
  const current = props.versionNumber == null;
  const canQuick = current && !!doc.data && can(doc.data.permissions, 'upload_version');
  const canOffice =
    current &&
    !!status.data?.available &&
    (status.data.editable_extensions ?? []).includes(extensionOf(props.name));
  const refresh = () => {
    for (const k of ['document', 'versions', 'children', 'recent', 'preview-url'])
      void qc.invalidateQueries({ queryKey: [k] });
  };

  if (mode === 'quick')
    return (
      <TextEditor
        documentId={props.documentId}
        name={props.name}
        onClose={() => {
          setMode('view');
          refresh();
        }}
      />
    );
  if (mode === 'office')
    return (
      <OfficeViewer
        documentId={props.documentId}
        name={props.name}
        initialMode="edit"
        onUnavailable={() => setMode('view')}
        onClose={() => {
          setMode('view');
          refresh();
        }}
      />
    );
  return (
    <div className="grid gap-2">
      {(canQuick || canOffice) && (
        <div className="flex flex-wrap justify-end gap-2">
          {canQuick && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setMode('quick')}
              data-testid="edit-text"
            >
              <Pencil /> Edit
            </Button>
          )}
          {canOffice && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMode('office')}
              data-testid="edit-text-office"
            >
              Open in office editor
            </Button>
          )}
        </div>
      )}
      <InlinePreview {...props} />
    </div>
  );
}

/**
 * Entry point for every preview. Picks the viewer from the file type: pdf.js for PDF, the office suite for
 * Word/Excel/PowerPoint/ODF, and light viewers for images, text and CSV. Callers are unchanged.
 */
export function PreviewPanel(props: Props) {
  const kind = previewKind(props.contentType, props.name);
  if (kind === 'office') return <OfficePreview {...props} />;
  if (kind === 'unsupported')
    return (
      <NoPreview
        props={props}
        reason="This file type cannot be previewed. Download it to open it."
      />
    );
  if (kind === 'text' || kind === 'csv') return <EditableTextPreview {...props} kind={kind} />;
  return <InlinePreview {...props} kind={kind} />;
}
