'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { requestDownloadUrl, downloadDocument } from '@/features/files/download';
import { isApiError } from '@/lib/api-client';

/**
 * Inline preview. A FRESH short-lived inline URL is requested every time this mounts (gcTime 0 so it is never
 * reused from cache). pdf -> iframe, images -> <img>, text -> sandboxed iframe. 409 not_previewable offers download.
 */
export function PreviewPanel({
  documentId,
  versionNumber,
  contentType,
  name,
  canDownload,
}: {
  documentId: string;
  versionNumber?: number | null;
  contentType: string;
  name: string;
  canDownload: boolean;
}) {
  const q = useQuery({
    queryKey: ['preview-url', documentId, versionNumber ?? 'current'],
    queryFn: () => requestDownloadUrl(documentId, { versionNumber, inline: true }),
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    retry: false,
  });

  if (q.isPending) return <Skeleton className="h-96 w-full" />;
  if (q.isError) {
    if (isApiError(q.error) && q.error.code === 'not_previewable') {
      return (
        <EmptyState
          title="No preview for this file type"
          description="Download the file to view it."
          action={
            canDownload && (
              <Button variant="primary" onClick={() => void downloadDocument(documentId, versionNumber)}>
                <Download /> Download
              </Button>
            )
          }
        />
      );
    }
    return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  }

  const { url } = q.data;
  const ct = contentType.split(';')[0]!.trim().toLowerCase();
  return (
    <div className="grid gap-2">
      <div className="overflow-hidden rounded-md border border-line bg-surface-2">
        {ct.startsWith('image/') ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`Preview of ${name}`} className="mx-auto max-h-[70vh] object-contain" referrerPolicy="no-referrer" />
        ) : ct === 'application/pdf' ? (
          <iframe title={`Preview of ${name}`} src={url} className="h-[70vh] w-full" referrerPolicy="no-referrer" />
        ) : (
          <iframe title={`Preview of ${name}`} src={url} sandbox="" className="h-[60vh] w-full bg-white" referrerPolicy="no-referrer" />
        )}
      </div>
      <p className="text-xs text-muted">
        <a className="inline-flex items-center gap-1 text-accent hover:underline" href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="size-3" aria-hidden /> Open preview in a new tab
        </a>{' '}
        (the link expires in about a minute)
      </p>
    </div>
  );
}
