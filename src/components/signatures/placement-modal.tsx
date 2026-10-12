'use client';

import * as pdfjs from 'pdfjs-dist';
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { api } from '@/lib/api-client';
import {
  clampBox,
  DEFAULT_BOX,
  toApiPlacement,
  type PlacementBox,
} from './placement-modal.helpers';

export { clampBox, DEFAULT_BOX, toApiPlacement, type PlacementBox };

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

async function loadPreview(documentId: string): Promise<ArrayBuffer> {
  const r = await api.GET('/api/v1/documents/{document_id}/signature-preview-pdf', {
    params: { path: { document_id: documentId } },
    parseAs: 'arrayBuffer',
  });
  if (r.data) return r.data as ArrayBuffer;
  // an error body is JSON {error:{message}} - show the real reason (e.g. "can't be converted to PDF")
  const raw = r.error as unknown;
  let message = 'Could not prepare a preview for placing the signature';
  try {
    const text =
      raw instanceof ArrayBuffer
        ? new TextDecoder().decode(raw)
        : typeof raw === 'string'
          ? raw
          : '';
    const parsed = text ? JSON.parse(text) : (raw as { error?: { message?: string } });
    message = parsed?.error?.message ?? message;
  } catch {
    /* keep the generic message */
  }
  throw new Error(message);
}

/**
 * Lets the requester drag-and-resize a "Sign here" box on a live preview of the exact PDF that will be sent for
 * signing (non-PDF files are converted by the server first), instead of the signature always landing in the same
 * fixed spot. Positions are percentages of the page. Used with the external signing provider.
 */
export function SignaturePlacementModal({
  documentId,
  confirmLabel,
  open,
  onCancel,
  onConfirm,
}: {
  documentId: string;
  confirmLabel?: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: (box: PlacementBox) => Promise<void> | void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{
    mode: 'move' | 'resize';
    x: number;
    y: number;
    box: PlacementBox;
  } | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [box, setBox] = useState<PlacementBox>(DEFAULT_BOX);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let task: pdfjs.PDFDocumentLoadingTask | null = null;
    loadPreview(documentId)
      .then((data) => {
        task = pdfjs.getDocument({ data });
        return task.promise;
      })
      .then((doc) => {
        if (cancelled) return;
        setPdf(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : 'Could not prepare a preview for placing the signature',
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [documentId, open]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let task: pdfjs.RenderTask | null = null;
    void pdf.getPage(box.pageNumber).then((page) => {
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const containerWidth = canvas.parentElement?.parentElement?.clientWidth || 800;
      const base = page.getViewport({ scale: 1 });
      // fit the whole page in view (width and height) so the box never needs scrolling to reach
      const maxHeight = Math.max(360, window.innerHeight * 0.6);
      const scale = Math.min((containerWidth - 24) / base.width, maxHeight / base.height, 1.6);
      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      sizeRef.current = { width: viewport.width, height: viewport.height };
      setSize(sizeRef.current);
      task = page.render({ canvas, viewport });
      task.promise.catch(() => {});
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, box.pageNumber]);

  // the active drag's cleanup, so closing the dialog mid-drag never leaves window listeners behind
  const endDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => endDrag.current?.(), []);

  function start(e: React.PointerEvent, mode: 'move' | 'resize') {
    e.preventDefault();
    e.stopPropagation();
    endDrag.current?.();
    dragRef.current = { mode, x: e.clientX, y: e.clientY, box };
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      const { width, height } = sizeRef.current;
      if (!d || !width || !height) return;
      const dx = ((ev.clientX - d.x) / width) * 100;
      const dy = ((ev.clientY - d.y) / height) * 100;
      setBox(
        clampBox(
          d.mode === 'move'
            ? { ...d.box, pageX: d.box.pageX + dx, pageY: d.box.pageY + dy }
            : { ...d.box, pageWidth: d.box.pageWidth + dx, pageHeight: d.box.pageHeight + dy },
        ),
      );
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      endDrag.current = null;
    };
    endDrag.current = onUp;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  async function confirm() {
    setSending(true);
    try {
      await onConfirm(box);
    } catch {
      /* the caller reports the failure; stay open so the box need not be placed again */
    } finally {
      setSending(false);
    }
  }

  const goTo = (n: number) =>
    setBox((b) => ({ ...b, pageNumber: Math.min(Math.max(n, 1), numPages) }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !sending && onCancel()}>
      <DialogContent
        title="Place the signature"
        description="Choose where on the document the signature goes."
        className="max-w-4xl"
      >
        <DialogBody className="max-h-[70vh] text-center">
          {loading && <p className="text-[13px] text-muted">Preparing preview...</p>}
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger"
            >
              <AlertTriangle className="size-4" aria-hidden /> {error}
            </div>
          )}
          {!loading && !error && (
            <>
              <p className="mb-2 text-xs text-muted">
                Drag the box to where the signature should go, and drag its bottom-right corner to
                resize it.
                {numPages > 1 && ' Use Prev/Next to place it on a different page.'} With several
                signers, the others&apos; boxes are placed directly below this one.
              </p>
              <div className="relative inline-block bg-white">
                <canvas ref={canvasRef} className="block border border-line" />
                <div
                  data-testid="placement-box"
                  onPointerDown={(e) => start(e, 'move')}
                  className="absolute flex cursor-move items-center justify-center rounded-sm border-[1.6px] border-accent bg-accent/20"
                  style={{
                    left: (box.pageX / 100) * size.width,
                    top: (box.pageY / 100) * size.height,
                    width: (box.pageWidth / 100) * size.width,
                    height: (box.pageHeight / 100) * size.height,
                    touchAction: 'none',
                  }}
                >
                  <span className="pointer-events-none text-[10px] font-bold text-accent">
                    Sign here
                  </span>
                  <div
                    role="presentation"
                    onPointerDown={(e) => start(e, 'resize')}
                    className="absolute -bottom-[5px] -right-[5px] size-3 cursor-nwse-resize rounded-full border-2 border-white bg-accent"
                    style={{ touchAction: 'none' }}
                  />
                </div>
              </div>
              {numPages > 1 && (
                <div className="mt-2 flex items-center justify-center gap-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={box.pageNumber <= 1}
                    onClick={() => goTo(box.pageNumber - 1)}
                  >
                    <ChevronLeft /> Prev
                  </Button>
                  <span className="text-xs text-muted">
                    Page {box.pageNumber} of {numPages}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={box.pageNumber >= numPages}
                    onClick={() => goTo(box.pageNumber + 1)}
                  >
                    Next <ChevronRight />
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel} disabled={sending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={loading || !!error || sending}
            onClick={() => void confirm()}
          >
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            {sending ? 'Sending...' : (confirmLabel ?? 'Send for signature')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
