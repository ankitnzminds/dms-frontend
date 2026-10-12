'use client';

/* Rows are mouse targets only: keyboard selection and opening is handled by the focused file-manager
   container (arrow keys, Enter, F2, Delete, ...), so a per-row key listener would duplicate it. */
/* eslint-disable jsx-a11y/click-events-have-key-events */

import { ArrowDown, ArrowUp, Lock, Scissors, Star } from 'lucide-react';
import { useState } from 'react';
import { ItemIcon, StatusChip } from '@/components/file-browser/file-bits';
import { Thumbnail } from '@/components/file-preview/thumbnail';
import { dragHasFiles, INTERNAL_DND } from '@/features/upload/read-entries';
import type { ColumnId, ViewMode } from '@/features/explorer/prefs';
import type { SortKey, SortOrder } from '@/features/files/hooks';
import type { TreeItem } from '@/lib/api-client';
import { formatBytes, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

const DOT: Record<string, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  yellow: 'bg-yellow-400',
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  pink: 'bg-pink-500',
  gray: 'bg-gray-400',
};

/** The item's color tag as a small dot (with a text label for assistive tech). */
export function ColorDot({ color, className }: { color?: string | null; className?: string }) {
  if (!color) return null;
  return (
    <span
      className={cn('inline-block size-2.5 shrink-0 rounded-full', DOT[color], className)}
      role="img"
      aria-label={`Color tag: ${color}`}
    />
  );
}

export interface ViewProps {
  items: TreeItem[];
  selected: Set<string>;
  focus: string | null;
  cutIds: Set<string>;
  view: ViewMode;
  columns: ColumnId[];
  sort: SortKey;
  order: SortOrder;
  onSort: (k: SortKey) => void;
  onRowClick: (id: string, e: React.MouseEvent) => void;
  onOpen: (item: TreeItem) => void;
  /** Items dragged onto a folder row (internal) or OS files dropped on it. */
  onDragStartItem: (item: TreeItem, e: React.DragEvent) => void;
  onDropOnFolder: (folder: TreeItem, e: React.DragEvent) => void;
  /** Per-row "more actions" menu (the touch / pointer alternative to right-click). */
  renderMenu: (item: TreeItem) => React.ReactNode;
  /** Hover/focus toolbar (Share, Download, Rename, Copy, Move, Delete, Permissions, overflow). */
  renderHover?: (item: TreeItem, forceVisible: boolean) => React.ReactNode;
}

const OFFICE_TYPES: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'application/msword': 'DOC',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.ms-powerpoint': 'PPT',
  'text/plain': 'TXT',
};

/** Short, readable type: known MIME types, else the file extension, else the MIME subtype. */
const typeLabel = (t: TreeItem) => {
  if (t.kind === 'folder') return 'Folder';
  const mime = t.content_type?.split(';')[0]?.trim().toLowerCase() ?? '';
  const known = OFFICE_TYPES[mime];
  if (known) return known;
  const ext = t.name.includes('.') ? t.name.split('.').pop()!.toUpperCase() : '';
  if (ext && ext.length <= 5) return ext;
  return mime.split('/')[1]?.toUpperCase() ?? 'File';
};

function LockBadge({ t }: { t: TreeItem }) {
  if (!t.locked) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-sm bg-warn-soft px-1 text-xs text-warn"
      data-testid="lock-badge"
    >
      <Lock className="size-3" aria-hidden />
      {t.kind === 'folder'
        ? t.locked_by_me
          ? 'Locked by you'
          : 'Locked'
        : t.locked_by_me
          ? 'Checked out by you'
          : 'Checked out'}
    </span>
  );
}

function NameCell({ t, thumb, size = 'sm' }: { t: TreeItem; thumb?: boolean; size?: 'sm' | 'lg' }) {
  const isImage =
    t.kind === 'document' && t.status === 'available' && t.content_type?.startsWith('image/');
  const icon = (
    <ItemIcon
      kind={t.kind}
      contentType={t.content_type}
      name={t.name}
      teamFolder={t.is_team_folder}
      className={size === 'lg' ? 'size-10' : undefined}
    />
  );
  return (
    <>
      {thumb && isImage ? (
        <Thumbnail
          documentId={t.id}
          name={t.name}
          className={size === 'lg' ? 'h-16 w-20' : 'size-6'}
          fallback={icon}
        />
      ) : (
        icon
      )}
    </>
  );
}

function rowHandlers(t: TreeItem, p: ViewProps, setOver: (v: boolean) => void) {
  const isFolder = t.kind === 'folder';
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => p.onDragStartItem(t, e),
    onDragOver: (e: React.DragEvent) => {
      if (!isFolder) return;
      if (e.dataTransfer.types.includes(INTERNAL_DND) || dragHasFiles(e.dataTransfer)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = dragHasFiles(e.dataTransfer)
          ? 'copy'
          : e.ctrlKey || e.metaKey
            ? 'copy'
            : 'move';
        setOver(true);
      }
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      setOver(false);
      if (!isFolder) return;
      e.preventDefault();
      e.stopPropagation();
      p.onDropOnFolder(t, e);
    },
  };
}

function Row({ t, p }: { t: TreeItem; p: ViewProps }) {
  const [over, setOver] = useState(false);
  const sel = p.selected.has(t.id);
  const cut = p.cutIds.has(t.id);
  // Any selection anywhere in the list hides every row's hover toolbar (actions live in the bar above).
  const noSelection = p.selected.size === 0;
  const col = (c: ColumnId) => p.columns.includes(c);
  return (
    <div
      id={`row-${t.id}`}
      role="row"
      aria-selected={sel}
      data-testid="item-row"
      data-item-id={t.id}
      data-kind={t.kind}
      data-selected={sel || undefined}
      data-cut={cut || undefined}
      className={cn(
        'group relative grid cursor-default select-none items-center gap-3 border-b border-line px-3 text-[13px] last:border-b-0',
        p.view === 'compact' ? 'py-0.5' : 'py-1.5',
        'grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_7rem_9rem_9rem_6rem]',
        sel ? 'bg-accent-soft shadow-[inset_3px_0_0_var(--accent)]' : 'hover:bg-surface-2',
        p.focus === t.id && 'outline outline-2 -outline-offset-2 outline-[var(--ring)]',
        cut && 'opacity-60',
        over && 'ring-2 ring-inset ring-accent bg-accent-soft/60',
      )}
      onClick={(e) => p.onRowClick(t.id, e)}
      onDoubleClick={() => p.onOpen(t)}
      {...rowHandlers(t, p, setOver)}
    >
      <div role="gridcell" className="@container flex min-w-0 items-center gap-2.5">
        <NameCell t={t} thumb />
        <span className="truncate font-medium" title={t.name}>
          {t.name}
        </span>
        {/* Hover only: while anything is selected the actions live in the bar above the list. */}
        {noSelection && p.renderHover?.(t, p.focus === t.id)}
        <ColorDot color={t.color_tag} />
        {cut && (
          <span className="inline-flex items-center gap-0.5 text-xs text-muted">
            <Scissors className="size-3" aria-hidden /> Cut
          </span>
        )}
        {t.starred && (
          <Star className="size-3 shrink-0 fill-warn text-warn" aria-label="In Quick Access" />
        )}
        <LockBadge t={t} />
        {col('status') && <StatusChip status={t.status} />}
        <span
          className={cn(
            'ml-auto',
            p.renderHover &&
              noSelection &&
              '@[26rem]:group-focus-within:invisible @[26rem]:group-hover:invisible',
            p.renderHover && noSelection && p.focus === t.id && '@[26rem]:invisible',
          )}
        >
          {p.renderMenu(t)}
        </span>
      </div>
      <span
        role="gridcell"
        className={cn('hidden truncate text-muted sm:block', !col('type') && 'sm:hidden')}
      >
        {col('type') ? typeLabel(t) : null}
      </span>
      <span
        role="gridcell"
        className={cn('hidden text-muted sm:block', !col('modified') && 'sm:hidden')}
      >
        {col('modified') ? formatRelative(t.updated_at) : null}
      </span>
      <span
        role="gridcell"
        className={cn('hidden truncate text-muted sm:block', !col('modified_by') && 'sm:hidden')}
      >
        {col('modified_by') ? (t.updated_by?.display_name ?? t.updated_by?.email ?? '-') : null}
      </span>
      <span
        role="gridcell"
        className={cn('hidden text-right tabular text-muted sm:block', !col('size') && 'sm:hidden')}
      >
        {col('size') ? (t.kind === 'folder' ? '-' : formatBytes(t.size_bytes)) : null}
      </span>
    </div>
  );
}

export function DetailsView(p: ViewProps) {
  const col = (c: ColumnId) => p.columns.includes(c);
  const head = (label: string, key: SortKey, show = true, right = false) => {
    if (!show) return <span className="hidden" />;
    const active = p.sort === key;
    const Icon = p.order === 'asc' ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => p.onSort(key)}
        className={cn(
          'hidden items-center gap-1 rounded-sm px-1 text-left hover:text-text sm:inline-flex',
          right && 'justify-end',
        )}
        aria-label={`Sort by ${label}${active ? `, currently ${p.order === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      >
        {label}
        {active && <Icon className="size-3" aria-hidden />}
      </button>
    );
  };
  return (
    <div
      role="grid"
      aria-label="Files and folders"
      aria-multiselectable="true"
      aria-activedescendant={p.focus ? `row-${p.focus}` : undefined}
    >
      <div
        role="row"
        className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-line px-3 py-1.5 text-xs font-medium text-muted sm:grid-cols-[minmax(0,1fr)_7rem_9rem_9rem_6rem]"
      >
        <button
          type="button"
          onClick={() => p.onSort('name')}
          className="inline-flex items-center gap-1 rounded-sm px-1 text-left hover:text-text"
          aria-label={`Sort by Name${p.sort === 'name' ? `, currently ${p.order === 'asc' ? 'ascending' : 'descending'}` : ''}`}
        >
          Name{' '}
          {p.sort === 'name' &&
            (p.order === 'asc' ? (
              <ArrowUp className="size-3" aria-hidden />
            ) : (
              <ArrowDown className="size-3" aria-hidden />
            ))}
        </button>
        {head('Type', 'type', col('type'))}
        {head('Modified', 'updated_at', col('modified'))}
        {head('Modified by', 'modified_by', col('modified_by'))}
        {head('Size', 'size', col('size'), true)}
      </div>
      {p.items.map((t) => (
        <Row key={t.id} t={t} p={p} />
      ))}
    </div>
  );
}

function Tile({ t, p, large }: { t: TreeItem; p: ViewProps; large: boolean }) {
  const [over, setOver] = useState(false);
  const sel = p.selected.has(t.id);
  const cut = p.cutIds.has(t.id);
  return (
    <div
      id={`row-${t.id}`}
      role="option"
      aria-selected={sel}
      data-testid="item-row"
      data-item-id={t.id}
      data-kind={t.kind}
      data-selected={sel || undefined}
      data-cut={cut || undefined}
      className={cn(
        'flex cursor-default select-none rounded-lg border p-2 text-[13px]',
        large ? 'flex-col items-center gap-1.5 text-center' : 'items-center gap-2.5',
        sel ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-surface-2',
        p.focus === t.id && 'outline outline-2 -outline-offset-2 outline-[var(--ring)]',
        cut && 'opacity-60',
        over && 'ring-2 ring-accent bg-accent-soft/60',
      )}
      onClick={(e) => p.onRowClick(t.id, e)}
      onDoubleClick={() => p.onOpen(t)}
      {...rowHandlers(t, p, setOver)}
    >
      <div className={cn('grid place-items-center', large ? 'h-20 w-full' : 'size-10 shrink-0')}>
        <NameCell t={t} thumb size={large ? 'lg' : 'sm'} />
      </div>
      <div className="min-w-0">
        <p className="truncate font-medium" title={t.name}>
          {t.name}
          <ColorDot color={t.color_tag} className="ml-1.5" />
          {t.starred && (
            <Star className="ml-1 inline size-3 fill-warn text-warn" aria-label="In Quick Access" />
          )}
        </p>
        <p className="truncate text-xs text-muted">
          {t.kind === 'folder' ? 'Folder' : `${typeLabel(t)} · ${formatBytes(t.size_bytes)}`}
          {cut && ' · Cut'}
        </p>
        <span className="flex flex-wrap justify-center gap-1">
          <StatusChip status={t.status} />
          <LockBadge t={t} />
        </span>
        <span className="mt-0.5 block">{p.renderMenu(t)}</span>
      </div>
    </div>
  );
}

export function GridView(p: ViewProps) {
  const large = p.view === 'grid';
  return (
    <div
      role="listbox"
      aria-label="Files and folders"
      aria-multiselectable="true"
      aria-activedescendant={p.focus ? `row-${p.focus}` : undefined}
      className={cn(
        'grid gap-2 p-3',
        large
          ? 'grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]'
          : 'grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]',
      )}
    >
      {p.items.map((t) => (
        <Tile key={t.id} t={t} p={p} large={large} />
      ))}
    </div>
  );
}

export function ItemsView(p: ViewProps) {
  if (p.view === 'tiles' || p.view === 'grid') return <GridView {...p} />;
  return <DetailsView {...p} />;
}
