'use client';

import * as pdfjs from 'pdfjs-dist';
import {
  EventBus,
  PDFFindController,
  PDFLinkService,
  PDFViewer,
} from 'pdfjs-dist/web/pdf_viewer.mjs';
import 'pdfjs-dist/web/pdf_viewer.css';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Printer,
  Search,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFullscreen } from './use-fullscreen';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { downloadDocument } from '@/features/files/download';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const ZOOM_STEP = 1.15;

/**
 * PDF viewer on the official pdf.js viewer components: real pagination, selectable text layer,
 * zoom, find-in-document and printing. Bytes come from a fresh short-lived, re-authorized ticket URL;
 * printing and downloading are offered only when the caller holds the download right.
 */
export function PdfViewer({
  url,
  documentId,
  name,
  canDownload,
}: {
  url: string;
  documentId: string;
  name: string;
  canDownload: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PDFViewer | null>(null);
  const busRef = useRef<EventBus | null>(null);
  const docRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus });
    const findController = new PDFFindController({ eventBus, linkService });
    const viewer = new PDFViewer({
      container,
      eventBus,
      linkService,
      findController,
      removePageBorders: false,
    });
    linkService.setViewer(viewer);
    viewerRef.current = viewer;
    busRef.current = eventBus;

    eventBus.on('pagesinit', () => {
      viewer.currentScaleValue = 'page-width';
      setPages(viewer.pagesCount);
      setState('ready');
    });
    eventBus.on('pagechanging', (e: { pageNumber: number }) => setPage(e.pageNumber));
    eventBus.on('scalechanging', (e: { scale: number }) => setZoom(Math.round(e.scale * 100)));
    eventBus.on(
      'updatefindmatchescount',
      (e: { matchesCount: { current: number; total: number } }) => setMatches(e.matchesCount),
    );
    eventBus.on(
      'updatefindcontrolstate',
      (e: { matchesCount: { current: number; total: number } }) => setMatches(e.matchesCount),
    );

    const task = pdfjs.getDocument({ url });
    task.promise
      .then((pdf) => {
        docRef.current = pdf;
        viewer.setDocument(pdf);
        linkService.setDocument(pdf, null);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'The PDF could not be loaded.');
        setState('error');
      });

    return () => {
      void task.destroy();
      viewer.cleanup();
      docRef.current = null;
      viewerRef.current = null;
    };
  }, [url]);

  const find = useCallback(
    (q: string, backwards = false) => {
      busRef.current?.dispatch('find', {
        source: null,
        type: backwards ? 'again' : q === query ? 'again' : '',
        query: q,
        caseSensitive: false,
        entireWord: false,
        highlightAll: true,
        findPrevious: backwards,
        matchDiacritics: false,
      });
    },
    [query],
  );

  const print = async () => {
    const data = await docRef.current?.getData();
    if (!data) return;
    const blobUrl = URL.createObjectURL(
      new Blob([new Uint8Array(data)], { type: 'application/pdf' }),
    );
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
    frame.src = blobUrl;
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(blobUrl);
      }, 60_000);
    };
    document.body.appendChild(frame);
  };

  // Re-fit pages to the new viewport size when entering/leaving full screen (pdf.js does not watch it).
  const refit = useCallback(() => {
    setTimeout(() => {
      const v = viewerRef.current;
      if (v) v.currentScaleValue = v.currentScaleValue;
    }, 150);
  }, []);
  const {
    ref: fsRef,
    isFullscreen,
    toggle: toggleFullscreen,
  } = useFullscreen<HTMLDivElement>(refit);

  const setScale = (v: number | 'page-width' | 'page-fit') => {
    if (viewerRef.current) viewerRef.current.currentScaleValue = String(v);
  };
  const zoomBy = (f: number) => {
    const v = viewerRef.current;
    if (v) v.currentScale = Math.min(5, Math.max(0.25, v.currentScale * f));
  };
  const goto = (n: number) => {
    const v = viewerRef.current;
    if (v && n >= 1 && n <= v.pagesCount) v.currentPageNumber = n;
  };

  return (
    <div
      ref={fsRef}
      className={
        isFullscreen
          ? 'grid h-screen grid-rows-[auto_minmax(0,1fr)] gap-2 bg-surface p-3'
          : 'grid gap-2'
      }
      data-testid="pdf-viewer"
    >
      <div
        role="toolbar"
        aria-label={`PDF tools for ${name}`}
        className="flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5 text-[13px]"
      >
        <Button
          variant="ghost"
          size="sm"
          aria-label="Previous page"
          onClick={() => goto(page - 1)}
          disabled={page <= 1}
        >
          <ChevronUp />
        </Button>
        <label className="flex items-center gap-1">
          <span className="sr-only">Page number</span>
          <input
            type="number"
            min={1}
            max={pages || 1}
            value={page}
            onChange={(e) => goto(Number(e.target.value))}
            className="h-7 w-14 rounded-md border border-line bg-surface px-1.5 text-center"
          />
          <span className="text-muted">/ {pages || '–'}</span>
        </label>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Next page"
          onClick={() => goto(page + 1)}
          disabled={page >= pages}
        >
          <ChevronDown />
        </Button>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <Button
          variant="ghost"
          size="sm"
          aria-label="Zoom out"
          onClick={() => zoomBy(1 / ZOOM_STEP)}
        >
          <Minus />
        </Button>
        <span className="w-10 text-center tabular-nums" aria-live="polite">
          {zoom}%
        </span>
        <Button variant="ghost" size="sm" aria-label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)}>
          <Plus />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setScale('page-width')}>
          Fit width
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setScale('page-fit')}>
          Fit page
        </Button>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <form
          role="search"
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            find(query);
          }}
        >
          <Search className="size-3.5 text-muted" aria-hidden />
          <input
            aria-label="Find in document"
            placeholder="Find in document"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-7 w-44 rounded-md border border-line bg-surface px-2"
          />
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                setMatches(null);
                busRef.current?.dispatch('findbarclose', { source: null });
              }}
            >
              <X />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Previous match"
            onClick={() => find(query, true)}
            disabled={!query}
          >
            <ChevronUp />
          </Button>
          <Button type="submit" variant="ghost" size="sm" aria-label="Next match" disabled={!query}>
            <ChevronDown />
          </Button>
          {matches && query && (
            <span className="text-xs text-muted" aria-live="polite">
              {matches.total === 0 ? 'No matches' : `${matches.current} of ${matches.total}`}
            </span>
          )}
        </form>
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleFullscreen}
          aria-pressed={isFullscreen}
          data-testid="pdf-fullscreen"
        >
          {isFullscreen ? <Minimize2 /> : <Maximize2 />}{' '}
          {isFullscreen ? 'Exit full screen' : 'Full screen'}
        </Button>
        {canDownload && (
          <>
            <Button variant="ghost" size="sm" onClick={() => void print()}>
              <Printer /> Print
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void downloadDocument(documentId)}>
              <Download /> Download
            </Button>
          </>
        )}
      </div>

      <div
        className={`relative overflow-hidden rounded-md border border-line bg-surface-2 ${isFullscreen ? 'h-full' : 'h-[72vh]'}`}
      >
        {state === 'loading' && <Skeleton className="absolute inset-0 z-10" />}
        {state === 'error' && (
          <p
            role="alert"
            className="absolute inset-0 z-10 grid place-items-center p-6 text-center text-sm text-danger"
          >
            {error || 'The PDF could not be displayed.'}
          </p>
        )}
        <div
          ref={containerRef}
          className={`absolute inset-0 overflow-auto ${canDownload ? '' : 'select-none'}`}
          tabIndex={0}
        >
          <div className="pdfViewer" />
        </div>
      </div>
    </div>
  );
}
