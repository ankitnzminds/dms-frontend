'use client';

import { ArchiveRestore, Flame, Info, RefreshCw, Search, ShieldAlert, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FolderPicker, type PickedFolder } from '@/components/file-browser/folder-picker';
import { ItemIcon } from '@/components/file-browser/file-bits';
import { PaginationBar } from '@/components/file-browser/pagination-bar';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useAdminUsers } from '@/features/admin-users/api';
import { friendlyMessage } from '@/lib/api-client';
import { formatBytes, formatDateTime } from '@/lib/format';
import {
  usePurgeItems,
  useRecycleBin,
  useRecycleDetail,
  useRestoreItems,
  type BulkOut,
  type RecycleFilters,
  type RecycleItem,
  type RecycleRef,
  type RestoreItem,
} from './api';

const PAGE = 25;
const SELECT =
  'h-9 rounded-md border border-line-strong bg-surface px-2 text-[13px] text-text focus-visible:outline-2 focus-visible:outline-accent';

const keyOf = (r: RecycleRef) => `${r.kind}:${r.id}`;
const refOf = (i: RecycleItem): RecycleRef => ({ kind: i.kind, id: i.id });

const PROBLEM_TEXT: Record<string, string> = {
  name_conflict: 'Something with this name already exists in the destination. Choose a new name.',
  parent_deleted: 'The original folder is gone or in the trash. Choose another location.',
  legal_hold: 'Blocked by a legal hold.',
  retention_active: 'Blocked by a retention policy that is still running.',
  not_found: 'This item is no longer in the Recycle Bin.',
};
const problem = (code?: string | null, message?: string | null) =>
  (code && PROBLEM_TEXT[code]) || message || 'This could not be completed.';

export function RecycleBinView() {
  const [f, setF] = useState<RecycleFilters>({
    q: '',
    deletedBy: '',
    fileType: '',
    source: '',
    dateFrom: '',
    dateTo: '',
    limit: PAGE,
    offset: 0,
  });
  const set = (p: Partial<RecycleFilters>) => setF((x) => ({ ...x, offset: 0, ...p }));
  const q = useRecycleBin(f);
  const users = useAdminUsers({
    q: '',
    status: 'all',
    sort: 'display_name',
    descending: false,
    limit: 100,
    offset: 0,
  });
  const [picked, setPicked] = useState<Map<string, RecycleItem>>(new Map());
  const [details, setDetails] = useState<RecycleRef | null>(null);
  const [restoring, setRestoring] = useState<RecycleItem[] | null>(null);
  const [purging, setPurging] = useState<RecycleItem[] | null>(null);

  const items = q.data?.items ?? [];
  const allOnPage = items.length > 0 && items.every((i) => picked.has(keyOf(i)));
  const toggle = (i: RecycleItem) =>
    setPicked((m) => {
      const n = new Map(m);
      if (n.has(keyOf(i))) n.delete(keyOf(i));
      else n.set(keyOf(i), i);
      return n;
    });
  const togglePage = () =>
    setPicked((m) => {
      const n = new Map(m);
      for (const i of items) {
        if (allOnPage) n.delete(keyOf(i));
        else n.set(keyOf(i), i);
      }
      return n;
    });
  const selected = useMemo(() => [...picked.values()], [picked]);
  const filtered = !!(f.q || f.deletedBy || f.fileType || f.source || f.dateFrom || f.dateTo);

  return (
    <>
      <PageHeader
        title="Recycle Bin"
        description="Everything deleted in this organization stays here until an administrator permanently deletes it. Users cannot erase content, even if they choose “Delete permanently”."
        actions={
          <Button variant="ghost" size="icon" aria-label="Refresh" onClick={() => void q.refetch()}>
            <RefreshCw className={q.isFetching ? 'animate-spin' : ''} />
          </Button>
        }
      />

      <Panel className="mb-3 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative sm:col-span-2">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Search deleted items"
            placeholder="Search by name"
            className="pl-8"
            value={f.q}
            onChange={(e) => set({ q: e.target.value })}
          />
        </div>
        <select
          aria-label="Deleted by"
          className={SELECT}
          value={f.deletedBy}
          onChange={(e) => set({ deletedBy: e.target.value })}
        >
          <option value="">Deleted by: anyone</option>
          {(users.data?.items ?? []).map((u) => (
            <option key={u.user_id} value={u.user_id}>
              {u.display_name ?? u.email}
            </option>
          ))}
        </select>
        <Input
          aria-label="File type"
          placeholder="Type (pdf, docx, folder)"
          value={f.fileType}
          onChange={(e) => set({ fileType: e.target.value })}
        />
        <select
          aria-label="Deletion source"
          className={SELECT}
          value={f.source}
          onChange={(e) => set({ source: e.target.value as RecycleFilters['source'] })}
        >
          <option value="">Source: any</option>
          <option value="trash">Moved to trash</option>
          <option value="user_permanent">User chose permanent</option>
        </select>
        <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-2">
          <Input
            type="date"
            aria-label="Deleted from"
            value={f.dateFrom}
            onChange={(e) => set({ dateFrom: e.target.value })}
          />
          <span className="text-xs text-muted">to</span>
          <Input
            type="date"
            aria-label="Deleted until"
            value={f.dateTo}
            onChange={(e) => set({ dateTo: e.target.value })}
          />
        </div>
        {filtered && (
          <div className="sm:col-span-2 lg:col-span-4">
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                set({ q: '', deletedBy: '', fileType: '', source: '', dateFrom: '', dateTo: '' })
              }
            >
              Clear filters
            </Button>
          </div>
        )}
      </Panel>

      {selected.length > 0 && (
        <div
          className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-accent-soft px-3 py-2 text-[13px]"
          role="region"
          aria-label="Bulk actions"
        >
          <strong>{selected.length} selected</strong>
          <Button size="sm" onClick={() => setRestoring(selected)} data-testid="bin-bulk-restore">
            <ArchiveRestore /> Restore
          </Button>
          <Button
            size="sm"
            variant="danger-ghost"
            onClick={() => setPurging(selected)}
            data-testid="bin-bulk-purge"
          >
            <Flame /> Delete permanently
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Map())}>
            Clear selection
          </Button>
        </div>
      )}

      <Panel className="min-w-0">
        {q.isPending ? (
          <SkeletonRows rows={6} label="Loading Recycle Bin" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Trash2}
            title={filtered ? 'Nothing matches these filters' : 'The Recycle Bin is empty'}
            description={
              filtered
                ? 'Try different filters.'
                : 'Files and folders that users delete will appear here.'
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto" tabIndex={0}>
              <table className="w-full min-w-[60rem] text-[13px]">
                <caption className="sr-only">Deleted files and folders</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="w-9 px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        checked={allOnPage}
                        onChange={togglePage}
                      />
                    </th>
                    <th className="px-2 py-2 font-medium">Name</th>
                    <th className="px-2 py-2 font-medium">Original location</th>
                    <th className="px-2 py-2 font-medium">Deleted by</th>
                    <th className="px-2 py-2 font-medium">Owner</th>
                    <th className="px-2 py-2 font-medium">Deleted</th>
                    <th className="px-2 py-2 font-medium">Size</th>
                    <th className="px-2 py-2 font-medium">Source</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((i) => (
                    <tr key={keyOf(i)} className="hover:bg-surface-2" data-testid="bin-row">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Select ${i.name}`}
                          checked={picked.has(keyOf(i))}
                          onChange={() => toggle(i)}
                        />
                      </td>
                      <td className="max-w-56 px-2 py-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <ItemIcon
                            kind={i.kind}
                            name={i.name}
                            contentType={i.content_type}
                            size={18}
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium" title={i.name}>
                              {i.name}
                            </span>
                            <span className="block text-xs text-muted">
                              {i.kind === 'folder'
                                ? `Folder · ${i.item_count} file${i.item_count === 1 ? '' : 's'}`
                                : 'File'}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="max-w-48 px-2 py-2">
                        <span className="block truncate text-muted" title={i.original_path}>
                          {i.original_path || '—'}
                        </span>
                        {!i.original_location_available && (
                          <span className="text-xs text-warn">Original folder unavailable</span>
                        )}
                      </td>
                      <td className="max-w-40 truncate px-2 py-2">
                        {i.deleted_by?.display_name ?? i.deleted_by?.email ?? '—'}
                      </td>
                      <td className="max-w-40 truncate px-2 py-2 text-muted">
                        {i.owner?.display_name ?? i.owner?.email ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-muted">
                        {formatDateTime(i.deleted_at)}
                      </td>
                      <td className="px-2 py-2 tabular text-muted">
                        {typeof i.size_bytes === 'number' ? formatBytes(i.size_bytes) : '—'}
                      </td>
                      <td className="px-2 py-2">
                        {i.deletion_source === 'user_permanent' ? (
                          <Badge tone="warn" title="The user chose “Delete permanently”">
                            User: permanent
                          </Badge>
                        ) : (
                          <Badge tone="neutral">Trash</Badge>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {i.recovery_status === 'protected' ? (
                          <Badge
                            tone="danger"
                            title="A legal hold or retention rule blocks permanent deletion"
                          >
                            <ShieldAlert /> Protected
                          </Badge>
                        ) : (
                          <Badge tone="ok">Recoverable</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Details of ${i.name}`}
                          onClick={() => setDetails(refOf(i))}
                        >
                          <Info />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Restore ${i.name}`}
                          onClick={() => setRestoring([i])}
                        >
                          <ArchiveRestore />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="danger-ghost"
                          aria-label={`Delete ${i.name} permanently`}
                          onClick={() => setPurging([i])}
                        >
                          <Flame />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              total={q.data.total}
              limit={PAGE}
              offset={f.offset}
              count={items.length}
              onOffsetChange={(offset) => setF((x) => ({ ...x, offset }))}
            />
          </>
        )}
      </Panel>

      {details && <DetailsDialog item={details} onClose={() => setDetails(null)} />}
      {restoring && (
        <RestoreDialog
          items={restoring}
          onClose={() => setRestoring(null)}
          onDone={(ok) => setPicked((m) => new Map([...m].filter(([k]) => !ok.has(k))))}
        />
      )}
      {purging && (
        <PurgeDialog
          items={purging}
          onClose={() => setPurging(null)}
          onDone={(ok) => setPicked((m) => new Map([...m].filter(([k]) => !ok.has(k))))}
        />
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="text-muted">{k}</dt>
      <dd className="min-w-0 text-right font-medium">{v}</dd>
    </div>
  );
}

function DetailsDialog({ item, onClose }: { item: RecycleRef; onClose: () => void }) {
  const q = useRecycleDetail(item);
  const d = q.data;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Deletion details" description={d?.name}>
        <DialogBody>
          {q.isPending ? (
            <SkeletonRows rows={4} label="Loading details" />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : d ? (
            <dl className="divide-y divide-line text-[13px]">
              <Row k="Type" v={d.kind === 'folder' ? 'Folder' : (d.content_type ?? 'File')} />
              <Row k="Original location" v={d.original_path || '—'} />
              <Row k="Deleted by" v={d.deleted_by?.display_name ?? d.deleted_by?.email ?? '—'} />
              <Row k="Original owner" v={d.owner?.display_name ?? d.owner?.email ?? '—'} />
              <Row k="Deleted" v={formatDateTime(d.deleted_at)} />
              <Row
                k="Deletion source"
                v={
                  d.deletion_source === 'user_permanent'
                    ? `User chose “Delete permanently” (${formatDateTime(d.permanent_requested_at)})`
                    : 'Moved to the trash'
                }
              />
              {d.permanent_requested_by && (
                <Row
                  k="Requested by"
                  v={d.permanent_requested_by.display_name ?? d.permanent_requested_by.email}
                />
              )}
              <Row
                k="Size"
                v={typeof d.size_bytes === 'number' ? formatBytes(d.size_bytes) : '—'}
              />
              <Row
                k="Contains"
                v={`${d.documents} file${d.documents === 1 ? '' : 's'}, ${d.folders} folder${d.folders === 1 ? '' : 's'}, ${d.versions} version${d.versions === 1 ? '' : 's'}`}
              />
              <Row
                k="Original folder"
                v={d.original_location_available ? 'Available' : 'Gone or in the trash'}
              />
              <Row
                k="Recovery status"
                v={
                  d.recovery_status === 'protected' ? (
                    <Badge tone="danger">Protected</Badge>
                  ) : (
                    <Badge tone="ok">Recoverable</Badge>
                  )
                }
              />
            </dl>
          ) : null}
          {d && d.protections.length > 0 && (
            <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
              Permanent deletion is blocked:{' '}
              {[...new Set(d.protections.map((p) => problem(p.reason)))].join(' ')}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Failed rows stay in the dialog with the reason, so the administrator can fix and retry just those. */
function RestoreDialog({
  items,
  onClose,
  onDone,
}: {
  items: RecycleItem[];
  onClose: () => void;
  onDone: (ok: Set<string>) => void;
}) {
  const restore = useRestoreItems();
  const [remaining, setRemaining] = useState(items);
  const [target, setTarget] = useState<PickedFolder | null>(null);
  const [alt, setAlt] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<
    Record<string, { code?: string | null; message?: string | null }>
  >({});

  const run = () => {
    const payload: RestoreItem[] = remaining.map((i) => ({
      ...refOf(i),
      new_name: names[keyOf(i)]?.trim() || null,
      target_folder_id: alt && target ? target.id : null,
    }));
    restore.mutate(payload, {
      onSuccess: (r: BulkOut) => {
        const okKeys = new Set(r.results.filter((x) => x.ok).map((x) => keyOf(x)));
        const bad = Object.fromEntries(
          r.results
            .filter((x) => !x.ok)
            .map((x) => [keyOf(x), { code: x.code, message: x.message }]),
        );
        onDone(okKeys);
        if (okKeys.size)
          toast.success(`Restored ${okKeys.size} item${okKeys.size === 1 ? '' : 's'}`);
        setErrors(bad);
        const left = remaining.filter((i) => !okKeys.has(keyOf(i)));
        setRemaining(left);
        if (left.length === 0) onClose();
      },
      onError: (e) => toast.error(friendlyMessage(e)),
    });
  };
  const needsFolder = Object.values(errors).some((e) => e.code === 'parent_deleted');

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Restore ${remaining.length === 1 ? remaining[0]!.name : `${remaining.length} items`}`}
        description="Items return with their IDs, versions, metadata and permissions. Nothing is copied."
      >
        <DialogBody>
          <fieldset className="grid gap-2 text-[13px]">
            <legend className="sr-only">Where to restore</legend>
            <label className="flex items-center gap-2">
              <input type="radio" checked={!alt} onChange={() => setAlt(false)} /> Original location
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={alt} onChange={() => setAlt(true)} /> A different folder
            </label>
          </fieldset>
          {(alt || needsFolder) && (
            <div className="mt-3 rounded-md border border-line p-2">
              <FolderPicker onChange={setTarget} />
              {!alt && needsFolder && (
                <p className="mt-2 text-xs text-warn">
                  Choose “A different folder” above to use this destination.
                </p>
              )}
            </div>
          )}
          <ul className="mt-3 grid gap-2">
            {remaining.map((i) => {
              const e = errors[keyOf(i)];
              return (
                <li key={keyOf(i)} className="rounded-md border border-line px-3 py-2 text-[13px]">
                  <span className="font-medium">{i.name}</span>
                  {e && (
                    <p role="alert" className="mt-1 text-xs text-danger">
                      {problem(e.code, e.message)}
                    </p>
                  )}
                  {(e?.code === 'name_conflict' || remaining.length === 1) && (
                    <Input
                      aria-label={`New name for ${i.name}`}
                      className="mt-2"
                      placeholder="Keep the original name, or enter a new one"
                      value={names[keyOf(i)] ?? ''}
                      onChange={(ev) => setNames((n) => ({ ...n, [keyOf(i)]: ev.target.value }))}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={run}
            disabled={restore.isPending || (alt && !target?.canCreate)}
            data-testid="bin-restore-confirm"
          >
            <ArchiveRestore /> Restore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PurgeDialog({
  items,
  onClose,
  onDone,
}: {
  items: RecycleItem[];
  onClose: () => void;
  onDone: (ok: Set<string>) => void;
}) {
  const purge = usePurgeItems();
  const [blocked, setBlocked] = useState<string[]>([]);
  const many = items.length > 1;
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={
        many
          ? `Permanently delete ${items.length} items?`
          : `Permanently delete “${items[0]!.name}”?`
      }
      description={
        <>
          This erases the{' '}
          {many
            ? 'items'
            : items[0]!.kind === 'folder'
              ? 'folder and everything inside it'
              : 'file'}{' '}
          and all stored versions from the system. <strong>It cannot be undone.</strong> Legal holds
          and retention rules still apply and block deletion.
          {blocked.length > 0 && (
            <span
              role="alert"
              className="mt-2 block rounded-md bg-danger-soft px-2 py-1.5 text-danger"
            >
              {blocked.map((b) => (
                <span key={b} className="block">
                  {b}
                </span>
              ))}
            </span>
          )}
        </>
      }
      confirmLabel="Delete permanently"
      destructive
      pending={purge.isPending}
      onConfirm={() =>
        purge.mutate(items.map(refOf), {
          onSuccess: (r) => {
            const ok = new Set(r.results.filter((x) => x.ok).map((x) => keyOf(x)));
            onDone(ok);
            if (ok.size)
              toast.success(`Permanently deleted ${ok.size} item${ok.size === 1 ? '' : 's'}`);
            const name = new Map(items.map((i) => [keyOf(i), i.name]));
            const bad = r.results
              .filter((x) => !x.ok)
              .map((x) => `${name.get(keyOf(x)) ?? 'Item'}: ${problem(x.code, x.message)}`);
            setBlocked(bad);
            if (bad.length === 0) onClose();
          },
          onError: (e) => setBlocked([friendlyMessage(e)]),
        })
      }
    />
  );
}
