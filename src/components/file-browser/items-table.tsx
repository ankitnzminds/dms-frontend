'use client';

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type RowSelectionState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, Star } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { SkeletonRows } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { toActionItem } from '@/features/explorer/resource';
import type { SortKey, SortOrder } from '@/features/files/hooks';
import type { TreeItem } from '@/lib/api-client';
import { formatBytes, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Thumbnail } from '@/components/file-preview/thumbnail';
import { ItemIcon, StatusChip } from './file-bits';
import {
  ResourceActionsCell,
  ResourceHover,
  ResourceTr,
} from '@/components/explorer/resource-actions';
import { PaginationBar } from './pagination-bar';

export { toActionItem };

const col = createColumnHelper<TreeItem>();

export interface ItemsTableProps {
  items: TreeItem[] | undefined;
  isLoading: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyState: React.ReactNode;
  sort?: { key: SortKey; order: SortOrder };
  onSortChange?: (key: SortKey) => void;
  selection?: RowSelectionState;
  onSelectionChange?: (s: RowSelectionState) => void;
  page?: { total: number; limit: number; offset: number; onOffsetChange: (o: number) => void };
  caption: string;
  /** Page-specific extras after the name (badges) and before the Actions button (buttons). */
  /** Lists that never need a horizontal scrollbar can opt out (the table then fits its container). */
  fit?: boolean;
  hideSize?: boolean;
  nameExtra?: (t: TreeItem) => React.ReactNode;
  actionsExtra?: (t: TreeItem) => React.ReactNode;
}

/** Server-sorted, server-paginated list of files/folders (TanStack Table, manual sort + pagination). */
export function ItemsTable({
  items,
  isLoading,
  error,
  onRetry,
  emptyState,
  sort,
  onSortChange,
  selection,
  onSelectionChange,
  page,
  caption,
  nameExtra,
  actionsExtra,
  fit,
  hideSize,
}: ItemsTableProps) {
  const selectable = !!onSelectionChange;
  // Folders first within the page (stable).
  const data = useMemo(
    () =>
      items
        ? [...items].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'folder' ? -1 : 1))
        : [],
    [items],
  );

  const columns = useMemo(() => {
    const sortHeader = (label: string, key: SortKey) => {
      const active = sort?.key === key;
      const Icon = !active ? ChevronsUpDown : sort!.order === 'asc' ? ArrowUp : ArrowDown;
      return onSortChange ? (
        <button
          type="button"
          onClick={() => onSortChange(key)}
          className="-mx-1 inline-flex items-center gap-1 rounded-sm px-1 hover:text-text"
        >
          {label}
          <Icon className={cn('size-3', active ? 'text-text' : 'text-faint')} aria-hidden />
          <span className="sr-only">
            {active
              ? `, sorted ${sort!.order === 'asc' ? 'ascending' : 'descending'}`
              : ', sortable'}
          </span>
        </button>
      ) : (
        label
      );
    };
    return [
      ...(selectable
        ? [
            col.display({
              id: 'select',
              header: ({ table }) => (
                <Checkbox
                  aria-label="Select all on this page"
                  checked={
                    table.getIsAllRowsSelected()
                      ? true
                      : table.getIsSomeRowsSelected()
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={(c) => table.toggleAllRowsSelected(c === true)}
                />
              ),
              cell: ({ row }) => (
                <Checkbox
                  aria-label={`Select ${row.original.name}`}
                  checked={row.getIsSelected()}
                  onCheckedChange={(c) => row.toggleSelected(c === true)}
                />
              ),
              meta: { className: 'w-9' },
            }),
          ]
        : []),
      col.accessor('name', {
        header: () => sortHeader('Name', 'name'),
        cell: ({ row }) => {
          const t = row.original;
          const href = t.kind === 'folder' ? `/files/${t.id}` : `/documents/${t.id}`;
          return (
            <div className="@container flex min-w-0 items-center gap-2.5">
              {t.kind === 'document' &&
              t.status === 'available' &&
              t.content_type?.startsWith('image/') ? (
                <Thumbnail
                  documentId={t.id}
                  name={t.name}
                  className="size-6 shrink-0"
                  fallback={<ItemIcon kind={t.kind} contentType={t.content_type} name={t.name} />}
                />
              ) : (
                <ItemIcon
                  kind={t.kind}
                  contentType={t.content_type}
                  name={t.name}
                  teamFolder={t.is_team_folder}
                />
              )}
              <Link
                href={href}
                className="truncate font-medium hover:text-accent hover:underline"
                title={t.name}
              >
                {t.name}
              </Link>
              <ResourceHover />
              {nameExtra?.(t)}
              {t.starred && (
                <Star className="size-3 shrink-0 fill-warn text-warn" aria-label="Starred" />
              )}
              <StatusChip status={t.status} />
            </div>
          );
        },
      }),
      ...(hideSize
        ? []
        : [
            col.accessor('size_bytes', {
              header: () => sortHeader('Size', 'size'),
              cell: (c) => (
                <span className="tabular text-muted">
                  {c.row.original.kind === 'folder' ? '-' : formatBytes(c.getValue())}
                </span>
              ),
              meta: { className: 'hidden sm:table-cell w-28 text-right' },
            }),
          ]),
      col.accessor('updated_at', {
        header: () => sortHeader('Modified', 'updated_at'),
        cell: (c) => <span className="text-muted">{formatRelative(c.getValue())}</span>,
        meta: { className: 'hidden md:table-cell w-36' },
      }),
      col.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: () => null,
        meta: { className: actionsExtra ? 'w-48 text-right' : 'w-10 text-right' },
      }),
    ];
  }, [selectable, sort, onSortChange, nameExtra, actionsExtra, hideSize]);

  const table = useReactTable({
    data,
    columns,
    getRowId: (r) => r.id,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    enableRowSelection: selectable,
    state: { rowSelection: selection ?? {} },
    onRowSelectionChange: (u) => {
      if (!onSelectionChange) return;
      onSelectionChange(typeof u === 'function' ? u(selection ?? {}) : u);
    },
  });

  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (isLoading) return <SkeletonRows rows={7} label="Loading files" />;
  if (data.length === 0) return <>{emptyState}</>;

  return (
    <div>
      <div className={fit ? undefined : 'overflow-x-auto'} tabIndex={fit ? undefined : 0}>
        <table className="w-full table-fixed border-collapse text-[13px]">
          <caption className="sr-only">{caption}</caption>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr
                key={hg.id}
                className="border-b border-line text-left text-xs font-medium text-muted"
              >
                {hg.headers.map((h) => {
                  const k = sort && h.column.id === (sort.key === 'size' ? 'size_bytes' : sort.key);
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={
                        k ? (sort!.order === 'asc' ? 'ascending' : 'descending') : undefined
                      }
                      className={cn(
                        'px-3 py-2 font-medium',
                        (h.column.columnDef.meta as { className?: string } | undefined)?.className,
                      )}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <ResourceTr
                key={row.id}
                item={row.original}
                selected={Object.keys(selection ?? {}).length > 0}
                data-kind={row.original.kind}
                data-state={row.getIsSelected() ? 'selected' : undefined}
                className="border-b border-line last:border-b-0 hover:bg-surface-2 data-[state=selected]:bg-accent-soft/60"
              >
                {row.getVisibleCells().map((cell) =>
                  cell.column.id === 'actions' ? (
                    <ResourceActionsCell key={cell.id} className="text-right">
                      {actionsExtra?.(row.original)}
                    </ResourceActionsCell>
                  ) : (
                    <td
                      key={cell.id}
                      className={cn(
                        'px-3 py-2 align-middle',
                        (cell.column.columnDef.meta as { className?: string } | undefined)
                          ?.className,
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ),
                )}
              </ResourceTr>
            ))}
          </tbody>
        </table>
      </div>
      {page && <PaginationBar {...page} count={data.length} />}
    </div>
  );
}
