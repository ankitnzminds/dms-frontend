'use client';

import type { RowSelectionState } from '@tanstack/react-table';
import { FolderPlus, FolderOpen, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { PathTrail } from '@/components/navigation/path-trail';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { DisabledReason } from '@/components/ui/tooltip';
import { DropZone } from '@/components/upload/drop-zone';
import { UploadButton } from '@/components/upload/upload-button';
import { useChildren, useFolder, type SortKey, type SortOrder } from '@/features/files/hooks';
import { can } from '@/lib/permissions';
import { BulkDeleteDialog } from './bulk-delete-dialog';
import { ItemActionsProvider } from './item-actions';
import { ItemsTable } from './items-table';
import { NewFolderDialog } from './name-dialogs';

const PAGE_SIZE = 50;

export function FolderView({ folderId }: { folderId: string }) {
  const folder = useFolder(folderId);
  const [sort, setSort] = useState<{ key: SortKey; order: SortOrder }>({ key: 'name', order: 'asc' });
  const [offset, setOffset] = useState(0);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [newFolder, setNewFolder] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const children = useChildren(folderId, { limit: PAGE_SIZE, offset, sort: sort.key, order: sort.order });

  const items = children.data?.items;
  const selected = useMemo(() => (items ?? []).filter((i) => selection[i.id]), [items, selection]);
  const canCreate = can(folder.data?.permissions, 'create_child');
  const bulkDeleteBlocked = selected.find((s) => !can(s.permissions, 'delete'));

  if (folder.isError) return <ErrorState error={folder.error} onRetry={() => folder.refetch()} />;

  const f = folder.data;
  const createReason = canCreate ? null : 'You do not have permission to add items to this folder.';

  return (
    <ItemActionsProvider>
      <PageHeader
        title={f?.name ?? 'Loading…'}
        trail={f && f.breadcrumb.length > 0 ? <PathTrail segments={f.breadcrumb} /> : undefined}
        description={f?.is_root ? 'Your organization’s canonical folder tree.' : undefined}
        actions={
          f && (
            <>
              <DisabledReason reason={createReason}>
                <Button disabled={!canCreate} onClick={() => setNewFolder(true)}>
                  <FolderPlus /> New folder
                </Button>
              </DisabledReason>
              <UploadButton folderId={folderId} disabledReason={createReason} />
            </>
          )
        }
      />

      {selected.length > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent-soft px-3 py-1.5 text-[13px]"
        >
          <span className="font-medium text-accent-soft-fg" aria-live="polite">
            {selected.length} selected
          </span>
          <DisabledReason reason={bulkDeleteBlocked ? `You cannot delete "${bulkDeleteBlocked.name}".` : null}>
            <Button size="sm" variant="danger-ghost" disabled={!!bulkDeleteBlocked} onClick={() => setBulkOpen(true)}>
              <Trash2 /> Move to trash
            </Button>
          </DisabledReason>
          <DisabledReason reason="Moving several items at once is not available yet. Move items one at a time from their menu.">
            <Button size="sm" disabled>
              Move
            </Button>
          </DisabledReason>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelection({})}>
            Clear selection
          </Button>
        </div>
      )}

      <Panel>
        <DropZone folderId={folderId} enabled={canCreate} className="min-h-48">
          <ItemsTable
            caption={`Contents of ${f?.name ?? 'folder'}`}
            items={items}
            isLoading={folder.isPending || children.isPending}
            error={children.error}
            onRetry={() => children.refetch()}
            sort={sort}
            onSortChange={(key) => {
              setOffset(0);
              setSort((s) => (s.key === key ? { key, order: s.order === 'asc' ? 'desc' : 'asc' } : { key, order: 'asc' }));
            }}
            selection={selection}
            onSelectionChange={setSelection}
            page={
              children.data && {
                total: children.data.total,
                limit: PAGE_SIZE,
                offset,
                onOffsetChange: (o) => {
                  setOffset(o);
                  setSelection({});
                },
              }
            }
            emptyState={
              <EmptyState
                icon={FolderOpen}
                title="This folder is empty"
                description={
                  canCreate
                    ? 'Drag files here, or use Upload and New folder to get started.'
                    : 'There is nothing here that you can see yet.'
                }
              />
            }
          />
        </DropZone>
      </Panel>

      <NewFolderDialog parentId={folderId} open={newFolder} onOpenChange={setNewFolder} />
      <BulkDeleteDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        items={selected.map((s) => ({ kind: s.kind, id: s.id, name: s.name }))}
        onFinished={(failed) => setSelection(Object.fromEntries(failed.map((id) => [id, true])))}
      />
    </ItemActionsProvider>
  );
}

