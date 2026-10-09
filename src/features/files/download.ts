import { api, call } from '@/lib/api-client';

export interface DownloadLink {
  url: string;
  expires_at: string;
}

/** Always requests a FRESH short-lived URL; never cache or store the result. */
export function requestDownloadUrl(
  documentId: string,
  opts: {
    versionNumber?: number | null;
    inline?: boolean;
    variant?: 'original' | 'thumbnail';
  } = {},
) {
  return call<DownloadLink>(
    api.POST('/api/v1/documents/{document_id}/download-url', {
      params: { path: { document_id: documentId } },
      body: {
        version_number: opts.versionNumber ?? null,
        inline: opts.inline ?? false,
        variant: opts.variant ?? 'original',
      },
    }),
  );
}

/** Fetch a fresh link and trigger the browser download immediately. */
export async function downloadDocument(documentId: string, versionNumber?: number | null) {
  const { url } = await requestDownloadUrl(documentId, { versionNumber });
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
