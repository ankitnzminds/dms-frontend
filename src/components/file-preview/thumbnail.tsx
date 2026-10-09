'use client';

import { useQuery } from '@tanstack/react-query';
import { requestDownloadUrl } from '@/features/files/download';
import { cn } from '@/lib/utils';

/**
 * Thumbnail via a FRESH short-lived URL (POST download-url {variant:"thumbnail"}); never cached.
 * Renders nothing when the server has no thumbnail (404/409), so callers keep their icon.
 */
export function Thumbnail({
  documentId,
  name,
  className,
  fallback = null,
}: {
  documentId: string;
  name: string;
  className?: string;
  /** Shown until (or instead of) a thumbnail. */
  fallback?: React.ReactNode;
}) {
  const q = useQuery({
    queryKey: ['thumbnail-url', documentId],
    queryFn: () => requestDownloadUrl(documentId, { variant: 'thumbnail', inline: true }),
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (!q.data) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={q.data.url}
      alt={`Thumbnail of ${name}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={cn('rounded-sm border border-line object-cover', className)}
    />
  );
}
