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

/** Server-side conversion by the office server. Needs download permission; nothing is stored. */
export async function downloadAsPdf(documentId: string, name: string) {
  const r = await api.POST('/api/v1/documents/{document_id}/export-pdf', {
    params: { path: { document_id: documentId } },
    parseAs: 'blob',
  });
  const url = URL.createObjectURL(r.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/\.[^.]+$/, '') || 'document'}.pdf`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** A folder as a ZIP. Only files you may download are included; the server reports how many were skipped. */
export async function downloadFolderZip(folderId: string, name: string) {
  const r = await api.POST('/api/v1/folders/{folder_id}/download-zip', {
    params: { path: { folder_id: folderId } },
    parseAs: 'blob',
  });
  const url = URL.createObjectURL(r.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name || 'folder'}.zip`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  const skipped = Number(r.response.headers.get('x-archive-skipped') ?? 0);
  return { skipped };
}
