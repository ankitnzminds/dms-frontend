'use client';

import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Loader2, RotateCcw, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, call, friendlyMessage, ApiError, type Document } from '@/lib/api-client';
import { formatBytes } from '@/lib/format';
import { useUploads } from '@/features/upload/upload-manager';
import type { UploadItem } from '@/features/upload/upload-engine';
import { cn } from '@/lib/utils';
import { RenameRetry } from './rename-retry';

const STATUS_TEXT: Record<UploadItem['status'], string> = {
  queued: 'Waiting',
  hashing: 'Preparing',
  starting: 'Starting',
  uploading: 'Uploading',
  finalizing: 'Finishing',
  done: 'Uploaded - scanning for malware',
  error: 'Failed',
  cancelled: 'Cancelled',
};

export function uploadErrorText(err: NonNullable<UploadItem['error']>) {
  const e = new ApiError({ status: err.status, code: err.code, message: err.message, requestId: err.requestId });
  switch (err.code) {
    case 'name_conflict':
      return 'A file with this name already exists here.';
    case 'quota_exceeded':
      return 'Not enough storage left in your organization.';
    case 'blocked_file_type':
      return 'This file type is not allowed.';
    case 'stale_version':
      return 'A newer version was uploaded by someone else. Reload and try again.';
    default:
      return friendlyMessage(e);
  }
}

/** stale_version: reload the document, then retry against its latest version number. */
function StaleRetry({ item }: { item: UploadItem }) {
  const { engine } = useUploads();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="mt-1 block">
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            const d = await call<Document>(
              api.GET('/api/v1/documents/{document_id}', { params: { path: { document_id: item.documentId! } } }),
            );
            engine.retry(item.id, undefined, d.latest_version_number);
          } catch (e) {
            setErr(friendlyMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Reload and retry
      </Button>
      {err && <span className="ml-2 text-danger">{err}</span>}
    </span>
  );
}

export function UploadRow({ item }: { item: UploadItem }) {
  const { engine } = useUploads();
  const active = ['queued', 'hashing', 'starting', 'uploading', 'finalizing'].includes(item.status);
  const pct = Math.round(item.progress * 100);
  return (
    <li className="px-3 py-2" data-testid="upload-row" data-status={item.status}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5">
          {item.status === 'done' ? (
            <CheckCircle2 className="size-4 text-ok" aria-hidden />
          ) : item.status === 'error' ? (
            <AlertCircle className="size-4 text-danger" aria-hidden />
          ) : active ? (
            <Loader2 className="size-4 animate-spin text-accent" aria-hidden />
          ) : (
            <X className="size-4 text-faint" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium" title={item.name}>
            {item.name}
          </p>
          <p className="text-xs text-muted">
            {formatBytes(item.file.size)} · {STATUS_TEXT[item.status]}
            {item.status === 'uploading' && ` ${pct}%`}
          </p>
          {(item.status === 'uploading' || item.status === 'finalizing') && (
            <div
              role="progressbar"
              aria-label={`Upload progress for ${item.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3"
            >
              <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
            </div>
          )}
          {item.status === 'error' && item.error && (
            <div className="mt-1 text-xs text-danger" role="alert">
              {uploadErrorText(item.error)}
              {item.error.requestId && (
                <span className="ml-1 text-faint">(ref {item.error.requestId.slice(0, 8)})</span>
              )}
              {item.error.code === 'stale_version' && item.documentId && <StaleRetry item={item} />}
              {item.error.code === 'name_conflict' && (
                <RenameRetry
                  initial={item.name}
                  onSubmit={(name) => engine.retry(item.id, name)}
                />
              )}
            </div>
          )}
          {item.status === 'done' && item.result?.document_id && (
            <Link className="text-xs text-accent hover:underline" href={`/documents/${item.result.document_id}`}>
              Open document
            </Link>
          )}
        </div>
        <div className="flex gap-0.5">
          {active && (
            <Button size="icon-sm" variant="ghost" aria-label={`Cancel upload of ${item.name}`} onClick={() => engine.cancel(item.id)}>
              <X />
            </Button>
          )}
          {(item.status === 'error' || item.status === 'cancelled') && (
            <>
              {item.error?.code !== 'name_conflict' && item.error?.code !== 'stale_version' && (
                <Button size="icon-sm" variant="ghost" aria-label={`Retry upload of ${item.name}`} onClick={() => engine.retry(item.id)}>
                  <RotateCcw />
                </Button>
              )}
              <Button size="icon-sm" variant="ghost" aria-label={`Dismiss ${item.name}`} onClick={() => engine.dismiss(item.id)}>
                <X />
              </Button>
            </>
          )}
          {item.status === 'done' && (
            <Button size="icon-sm" variant="ghost" aria-label={`Dismiss ${item.name}`} onClick={() => engine.dismiss(item.id)}>
              <X />
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

export function UploadList({ items }: { items: readonly UploadItem[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((i) => (
        <UploadRow key={i.id} item={i} />
      ))}
    </ul>
  );
}

/** Floating queue shown while uploads exist. Announces progress politely for assistive tech. */
export function UploadPanel() {
  const { items, engine } = useUploads();
  const [collapsed, setCollapsed] = useState(false);
  if (items.length === 0) return null;
  const running = items.filter((i) => ['queued', 'hashing', 'starting', 'uploading', 'finalizing'].includes(i.status)).length;
  const failed = items.filter((i) => i.status === 'error').length;
  const summary = running
    ? `Uploading ${running} file${running === 1 ? '' : 's'}`
    : failed
      ? `${failed} upload${failed === 1 ? '' : 's'} failed`
      : 'Uploads complete';

  return (
    <section
      aria-label="Uploads"
      className="fixed inset-x-2 bottom-2 z-40 overflow-hidden rounded-lg border border-line bg-surface shadow-pop sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96"
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <h2 className={cn('flex-1 text-[13px] font-semibold')} role="status" aria-live="polite">
          {summary}
        </h2>
        {!running && (
          <Button size="sm" variant="ghost" onClick={() => engine.clearFinished()}>
            Clear
          </Button>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={collapsed ? 'Expand uploads' : 'Collapse uploads'}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <ChevronUp /> : <ChevronDown />}
        </Button>
      </div>
      {!collapsed && (
        <div className="scroll-thin max-h-72 overflow-y-auto">
          <UploadList items={items} />
        </div>
      )}
    </section>
  );
}
