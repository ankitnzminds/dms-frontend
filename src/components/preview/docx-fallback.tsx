'use client';

import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { requestDownloadUrl } from '@/features/files/download';

/**
 * Approximate DOCX rendering in the browser (docx-preview) for when no office server is available.
 * It needs the file's bytes, so it requires the DOWNLOAD right (the parent checks). Fidelity is lower
 * than the office suite (fonts, complex layouts, fields); the banner says so.
 */
export function DocxFallback({ documentId, name }: { documentId: string; name: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { url } = await requestDownloadUrl(documentId);
      const res = await fetch(url);
      if (!res.ok) throw new Error('download failed');
      const buf = await res.arrayBuffer();
      const { renderAsync } = await import('docx-preview');
      if (cancelled || !host.current) return;
      host.current.innerHTML = '';
      await renderAsync(buf, host.current, undefined, {
        className: 'docx',
        inWrapper: true,
        ignoreWidth: false,
        breakPages: true,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        useBase64URL: true,
      });
      if (!cancelled) setState('ready');
    })().catch(() => !cancelled && setState('error'));
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  return (
    <div className="grid gap-2" data-testid="docx-fallback">
      <p className="rounded-md bg-warning-soft px-3 py-1.5 text-xs text-warning-fg" role="note">
        Approximate preview: the office viewer is not available, so layout and fonts may differ from
        Word.
      </p>
      <div
        className="relative h-[72vh] overflow-auto rounded-md border border-line bg-surface-2"
        aria-label={`Preview of ${name}`}
      >
        {state === 'loading' && <Skeleton className="absolute inset-0" />}
        {state === 'error' && (
          <p role="alert" className="p-6 text-center text-sm text-danger">
            This document could not be previewed. Download it to open it.
          </p>
        )}
        <div ref={host} />
      </div>
    </div>
  );
}
