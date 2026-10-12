'use client';

import { Maximize2, Pencil, Eye } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useOfficeSession } from '@/features/preview/office';
import { friendlyMessage, isApiError } from '@/lib/api-client';

/**
 * Word/Excel/PowerPoint/ODF in the office suite (Collabora Online over WOPI), inside an iframe.
 * The browser never sees storage URLs: the backend mints a token scoped to this document and mode, we
 * POST it into the iframe (WOPI form post, so it never appears in a URL), and the office server fetches
 * and saves bytes through the backend, which re-authorizes every call.
 */
export function OfficeViewer({
  documentId,
  name,
  onUnavailable,
  initialMode = 'view',
  onClose,
}: {
  documentId: string;
  name: string;
  /** Open straight into editing (used by "Edit" on text files). */
  initialMode?: 'view' | 'edit';
  /** When given, "Done editing" leaves the editor through this instead of switching to view mode. */
  onClose?: () => void;
  /** The office server cannot handle this (not configured/unreachable/unsupported): use a fallback. */
  onUnavailable: (reason: string) => void;
}) {
  const [mode, setMode] = useState<'view' | 'edit'>(initialMode);
  const session = useOfficeSession();
  const frameName = `office-${useId().replace(/:/g, '')}`;
  const formRef = useRef<HTMLFormElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const { mutate } = session;

  const changeMode = (m: 'view' | 'edit') => {
    setLoaded(false);
    setMode(m);
  };

  useEffect(() => {
    mutate(
      { documentId, mode },
      {
        onError: (e) => {
          if (
            isApiError(e) &&
            ['office_unavailable', 'office_unsupported_type'].includes(e.code ?? '')
          )
            onUnavailable(e.message);
        },
      },
    );
    // onUnavailable is intentionally not a dependency: it must not restart the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, mode, mutate]);

  const data = session.data;
  useEffect(() => {
    if (data) formRef.current?.submit();
  }, [data]);

  if (
    session.isError &&
    !(
      isApiError(session.error) &&
      ['office_unavailable', 'office_unsupported_type'].includes(session.error.code ?? '')
    )
  ) {
    return (
      <p role="alert" className="p-6 text-center text-sm text-danger">
        {friendlyMessage(session.error)}
      </p>
    );
  }

  return (
    <div className="grid gap-2" data-testid="office-viewer">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-[13px]">
        <Badge>{data?.mode === 'edit' ? 'Editing' : 'Viewing'}</Badge>
        {data?.mode === 'edit' && (
          <span className="text-muted">Changes are saved as a new version.</span>
        )}
        {data?.mode === 'edit' && /\.(txt|md|csv)$/i.test(name) && (
          <span className="text-muted" data-testid="text-edit-hint">
            To type, choose Editing Mode (top right), then Continue editing.
          </span>
        )}
        {data && !data.can_edit && data.reason && <span className="text-muted">{data.reason}</span>}
        <span className="flex-1" />
        {mode === 'view' ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => changeMode('edit')}
            disabled={session.isPending}
          >
            <Pencil /> Edit
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (onClose ? onClose() : changeMode('view'))}
            disabled={session.isPending}
          >
            <Eye /> Done editing
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void boxRef.current?.requestFullscreen?.()}
        >
          <Maximize2 /> Full screen
        </Button>
      </div>
      <div
        ref={boxRef}
        className="relative h-[78vh] overflow-hidden rounded-md border border-line bg-surface-2"
      >
        {(session.isPending || !loaded) && <Skeleton className="absolute inset-0 z-10" />}
        <iframe
          name={frameName}
          title={`Document: ${name}`}
          className="size-full bg-white"
          onLoad={() => data && setLoaded(true)}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
          allow="clipboard-read; clipboard-write; fullscreen"
          referrerPolicy="no-referrer"
        />
        {data && (
          <form
            ref={formRef}
            method="post"
            action={data.editor_url}
            target={frameName}
            className="hidden"
          >
            <input type="hidden" name="access_token" value={data.access_token} readOnly />
            <input
              type="hidden"
              name="access_token_ttl"
              value={String(data.access_token_ttl)}
              readOnly
            />
          </form>
        )}
      </div>
    </div>
  );
}
