import { ApiError, apiErrorFromResponse } from './errors';

export interface PutBytesOptions {
  /** Absolute URL (use resolveUploadUrl). */
  url: string;
  body: Blob;
  headers: Record<string, string>;
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

/** Resolve the (possibly relative) `upload_url` from an UploadSession against the API root. */
export function resolveUploadUrl(uploadUrl: string, apiRoot: string): string {
  if (/^https?:\/\//i.test(uploadUrl)) return uploadUrl;
  return `${apiRoot.replace(/\/+$/, '')}${uploadUrl.startsWith('/') ? '' : '/'}${uploadUrl}`;
}

/**
 * PUT raw bytes with real upload progress (fetch has no upload progress, so XMLHttpRequest).
 * Resolves with the parsed JSON body; rejects with ApiError.
 */
export function putBytes<T = unknown>(opts: PutBytesOptions): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', opts.url);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    for (const [k, v] of Object.entries(opts.headers)) xhr.setRequestHeader(k, v);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded, e.total);
    };
    xhr.onload = () => {
      const headers = new Headers();
      const ra = xhr.getResponseHeader('retry-after');
      if (ra) headers.set('retry-after', ra);
      const rid = xhr.getResponseHeader('x-request-id');
      if (rid) headers.set('x-request-id', rid);
      const res = new Response(xhr.responseText || null, { status: xhr.status, headers });
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          resolve(undefined as T);
        }
      } else {
        apiErrorFromResponse(res).then(reject);
      }
    };
    xhr.onerror = () =>
      reject(new ApiError({ status: 0, code: 'network_error', message: 'Upload failed: cannot reach the server.' }));
    xhr.onabort = () => reject(new ApiError({ status: 0, code: 'aborted', message: 'Upload cancelled' }));

    if (opts.signal) {
      if (opts.signal.aborted) return reject(new ApiError({ status: 0, code: 'aborted', message: 'Upload cancelled' }));
      opts.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(opts.body);
  });
}

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** Hex SHA-256 of a file using WebCrypto (fine up to the 100 MB server limit). Returns null if unavailable. */
export async function sha256Hex(file: Blob): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
