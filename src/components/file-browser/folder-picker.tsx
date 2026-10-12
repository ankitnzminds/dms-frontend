'use client';

import { ChevronRight, Folder as FolderIcon, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PathTrail } from '@/components/navigation/path-trail';
import { ErrorState } from '@/components/ui/states';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useChildren, useFolder, useRootFolder } from '@/features/files/hooks';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';

export interface PickedFolder {
  id: string;
  name: string;
  canCreate: boolean;
}

/**
 * Browse folders (children?kind=folder) and pick a destination. A destination is only selectable when the
 * API says the caller may create items in it. `excludeId` hides a folder (and so its subtree) from the list.
 */
export function FolderPicker({
  onChange,
  excludeId,
  excludeIds = [],
  startFolderId,
}: {
  onChange: (f: PickedFolder | null) => void;
  excludeId?: string;
  /** Folders (and so their subtrees) that cannot be chosen, e.g. the items being moved. */
  excludeIds?: string[];
  /** Where browsing begins (defaults to the organization root). */
  startFolderId?: string;
}) {
  const root = useRootFolder();
  const [currentId, setCurrentId] = useState<string | undefined>(startFolderId);
  const id = currentId ?? root.data?.id;
  const folder = useFolder(id);
  const children = useChildren(id, {
    limit: 200,
    offset: 0,
    sort: 'name',
    order: 'asc',
    kind: 'folder',
  });

  const picked: PickedFolder | null = folder.data
    ? {
        id: folder.data.id,
        name: folder.data.name,
        canCreate: can(folder.data.permissions, 'upload') || can(folder.data.permissions, 'create_folder'),
      }
    : null;

  // Publish selection whenever the current folder changes.
  const pickedId = picked?.id ?? null;
  const pickedName = picked?.name ?? '';
  const pickedCan = picked?.canCreate ?? false;
  useEffect(() => {
    onChange(pickedId ? { id: pickedId, name: pickedName, canCreate: pickedCan } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedId, pickedName, pickedCan]);

  if (root.isError) return <ErrorState error={root.error} onRetry={() => root.refetch()} />;

  return (
    <div className="grid gap-2">
      <div className="min-h-6 rounded-md bg-surface-2 px-2 py-1">
        {folder.data ? (
          <PathTrail segments={folder.data.breadcrumb} current={folder.data.name} size="sm" />
        ) : (
          <span className="text-xs text-muted">Loading…</span>
        )}
      </div>
      {folder.data?.breadcrumb.length ? (
        <button
          type="button"
          className="justify-self-start text-xs text-accent hover:underline"
          onClick={() => setCurrentId(folder.data!.parent_folder_id ?? undefined)}
        >
          Up one level
        </button>
      ) : null}
      <div className="scroll-thin max-h-60 overflow-y-auto rounded-md border border-line">
        {children.isPending || !id ? (
          <SkeletonRows rows={4} label="Loading folders" />
        ) : children.isError ? (
          <ErrorState error={children.error} onRetry={() => children.refetch()} className="py-6" />
        ) : (
          <ul>
            {children.data.items
              .filter((f) => f.id !== excludeId && !excludeIds.includes(f.id))
              .map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => setCurrentId(f.id)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-surface-2',
                    )}
                  >
                    <FolderIcon className="size-4 text-accent" aria-hidden />
                    <span className="flex-1 truncate">{f.name}</span>
                    {!(can(f.permissions, 'upload') || can(f.permissions, 'create_folder')) && (
                      <Lock className="size-3 text-faint" aria-label="You cannot add items here" />
                    )}
                    <ChevronRight className="size-4 text-faint" aria-hidden />
                  </button>
                </li>
              ))}
            {children.data.items.filter((f) => f.id !== excludeId && !excludeIds.includes(f.id))
              .length === 0 && (
              <li className="px-3 py-4 text-center text-xs text-muted">No subfolders here.</li>
            )}
          </ul>
        )}
      </div>
      {picked && !picked.canCreate && (
        <p role="status" className="text-xs text-warn">
          You cannot add items to &ldquo;{picked.name}&rdquo;. Choose another folder.
        </p>
      )}
    </div>
  );
}
