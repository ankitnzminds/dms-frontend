'use client';

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FolderPlus,
  Loader2,
  MinusCircle,
  Pause,
  Play,
  RotateCcw,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, call, friendlyMessage, ApiError, type Document } from '@/lib/api-client';
import { formatBytes } from '@/lib/format';
import { useUploads } from '@/features/upload/upload-manager';
import { overallProgress, type UploadItem } from '@/features/upload/upload-engine';
import { cn } from '@/lib/utils';
import { RenameRetry } from './rename-retry';

const ACTIVE: UploadItem['status'][] = ['queued', 'hashing', 'starting', 'uploading', 'finalizing'];
const isActive = (s: UploadItem['status']) => ACTIVE.includes(s);

const STATUS_TEXT: Record<UploadItem['status'], string> = {
  queued: 'Waiting',
  hashing: 'Preparing',
  starting: 'Starting',
  uploading: 'Uploading',
  finalizing: 'Finishing',
  done: 'Uploaded - scanning for malware',
  error: 'Failed',
  cancelled: 'Cancelled',
  skipped: 'Skipped',
};

export function uploadErrorText(err: NonNullable<UploadItem['error']>) {
  const e = new ApiError({
    status: err.status,
    code: err.code,
    message: err.message,
    requestId: err.requestId,
  });
  switch (err.code) {
    case 'name_conflict':
      return 'A file with this name already exists here.';
    case 'quota_exceeded':
      return 'Not enough storage left in your organization.';
    case 'blocked_file_type':
      return 'This file type is not allowed.';
    case 'stale_version':
      return 'A newer version was uploaded by someone else. Reload and try again.';
    case 'folder_failed':
      return 'Could not create the folder for this file. Try again.';
    case 'document_locked':
      return 'This document is checked out by someone else.';
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
              api.GET('/api/v1/documents/{document_id}', {
                params: { path: { document_id: item.documentId! } },
              }),
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

/** Name conflict on upload: new version of the existing file / keep both / skip. */
function ConflictChoices({ item }: { item: UploadItem }) {
  const { engine } = useUploads();
  const [busy, setBusy] = useState(false);
  const [keepBoth, setKeepBoth] = useState(false);
  return (
    <span className="mt-1.5 block" data-testid="upload-conflict">
      <span className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="primary"
          disabled={busy || !!item.documentId}
          onClick={async () => {
            setBusy(true);
            const ok = await engine.asNewVersion(item.id);
            setBusy(false);
            if (!ok) toast.error('Could not find the existing file to add a version to.');
          }}
        >
          {busy && <Loader2 className="animate-spin" aria-hidden />} Upload as new version
        </Button>
        <Button size="sm" onClick={() => setKeepBoth((k) => !k)} aria-expanded={keepBoth}>
          Keep both
        </Button>
        <Button size="sm" onClick={() => engine.skip(item.id)}>
          Skip
        </Button>
      </span>
      {keepBoth && (
        <RenameRetry initial={item.name} onSubmit={(name) => engine.retry(item.id, name)} />
      )}
    </span>
  );
}

export function UploadRow({ item }: { item: UploadItem }) {
  const { engine } = useUploads();
  const active = isActive(item.status);
  const pct = Math.round(item.progress * 100);
  const label = item.relativeDir?.length ? `${item.relativeDir.join('/')}/${item.name}` : item.name;
  return (
    <li className="px-3 py-2" data-testid="upload-row" data-status={item.status}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5">
          {item.mkdirOnly ? (
            <FolderPlus className="size-4 text-accent" aria-hidden />
          ) : item.status === 'done' ? (
            <CheckCircle2 className="size-4 text-ok" aria-hidden />
          ) : item.status === 'error' ? (
            <AlertCircle className="size-4 text-danger" aria-hidden />
          ) : item.status === 'skipped' ? (
            <MinusCircle className="size-4 text-faint" aria-hidden />
          ) : active ? (
            <Loader2 className="size-4 animate-spin text-accent" aria-hidden />
          ) : (
            <X className="size-4 text-faint" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium" title={label}>
            {item.mkdirOnly ? `Folder ${label}` : label}
          </p>
          <p className="text-xs text-muted">
            {item.mkdirOnly ? '' : `${formatBytes(item.file.size)} · `}
            {item.mkdirOnly && item.status === 'done' ? 'Folder created' : STATUS_TEXT[item.status]}
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
          {item.status === 'skipped' && item.skipReason && (
            <p className="text-xs text-muted">{item.skipReason}</p>
          )}
          {item.status === 'error' && item.error && (
            <div className="mt-1 text-xs text-danger" role="alert">
              {uploadErrorText(item.error)}
              {item.error.requestId && (
                <span className="ml-1 text-faint">(ref {item.error.requestId.slice(0, 8)})</span>
              )}
              {item.error.code === 'stale_version' && item.documentId && <StaleRetry item={item} />}
              {item.error.code === 'name_conflict' && <ConflictChoices item={item} />}
            </div>
          )}
          {item.status === 'done' && item.result?.document_id && (
            <Link
              className="text-xs text-accent hover:underline"
              href={`/documents/${item.result.document_id}`}
            >
              Open document
            </Link>
          )}
        </div>
        <div className="flex gap-0.5">
          {active && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Cancel upload of ${item.name}`}
              onClick={() => engine.cancel(item.id)}
            >
              <X />
            </Button>
          )}
          {(item.status === 'error' || item.status === 'cancelled') &&
            item.error?.code !== 'name_conflict' &&
            item.error?.code !== 'stale_version' && (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Retry upload of ${item.name}`}
                onClick={() => engine.retry(item.id)}
              >
                <RotateCcw />
              </Button>
            )}
          {(item.status === 'error' ||
            item.status === 'cancelled' ||
            item.status === 'done' ||
            item.status === 'skipped') && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Dismiss ${item.name}`}
              onClick={() => engine.dismiss(item.id)}
            >
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
  const togglePause = useCallback(
    () => (engine.paused ? engine.resume() : engine.pause()),
    [engine],
  );
  if (items.length === 0) return null;
  const running = items.filter((i) => isActive(i.status)).length;
  const failed = items.filter((i) => i.status === 'error').length;
  const skipped = items.filter((i) => i.status === 'skipped').length;
  const prog = overallProgress(items);
  const summary =
    engine.paused && running
      ? `Paused (${running} waiting)`
      : running
        ? `Uploading ${running} item${running === 1 ? '' : 's'}`
        : failed
          ? `${failed} upload${failed === 1 ? '' : 's'} failed`
          : skipped
            ? `Uploads complete, ${skipped} skipped`
            : 'Uploads complete';

  return (
    <section
      aria-label="Uploads"
      className="fixed inset-x-2 bottom-20 z-40 overflow-hidden rounded-lg border border-line bg-surface shadow-pop sm:inset-x-auto sm:bottom-4 sm:right-32 sm:w-96"
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <h2 className={cn('flex-1 text-[13px] font-semibold')} role="status" aria-live="polite">
          {summary}
        </h2>
        {running > 0 && (
          <>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={engine.paused ? 'Resume uploads' : 'Pause uploads'}
              onClick={togglePause}
            >
              {engine.paused ? <Play /> : <Pause />}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => engine.cancelAll()}>
              Cancel all
            </Button>
          </>
        )}
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
      {prog.total > 0 && (
        <div className="px-3 pt-2">
          <div
            role="progressbar"
            aria-label="Overall upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(prog.fraction * 100)}
            className="h-1.5 overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${Math.round(prog.fraction * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted">
            {prog.done} of {prog.total} files
          </p>
        </div>
      )}
      {!collapsed && (
        <div className="scroll-thin max-h-72 overflow-y-auto">
          <UploadList items={items} />
        </div>
      )}
    </section>
  );
}
