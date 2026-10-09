'use client';

import { ChevronRight, Folder, Star } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useExplorerOps } from '@/components/explorer/ops';
import { useUploadPickers } from '@/components/upload/pickers';
import { isCopyDrop, readDragPayload } from '@/features/explorer/dnd';
import { useFavorites, useFolderChildren } from '@/features/explorer/hooks';
import { useRootFolder } from '@/features/files/hooks';
import { dragHasFiles, INTERNAL_DND } from '@/features/upload/read-entries';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';

function useFolderDrop(target: { id: string; name: string; canCreate: boolean }) {
  const ops = useExplorerOps();
  const pickers = useUploadPickers();
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes(INTERNAL_DND) || dragHasFiles(e.dataTransfer)) {
          e.preventDefault();
          e.dataTransfer.dropEffect =
            dragHasFiles(e.dataTransfer) || isCopyDrop(e) ? 'copy' : 'move';
          setOver(true);
        }
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        setOver(false);
        e.preventDefault();
        if (e.dataTransfer.types.includes(INTERNAL_DND)) {
          const items = readDragPayload(e.dataTransfer);
          if (items)
            ops.drop(isCopyDrop(e) ? 'copy' : 'move', items, { id: target.id, name: target.name });
        } else if (dragHasFiles(e.dataTransfer) && target.canCreate) {
          void pickers.dropInto(e.dataTransfer, target.id);
        }
      },
    },
  };
}

function Node({
  id,
  name,
  depth,
  canCreate,
}: {
  id: string;
  name: string;
  depth: number;
  canCreate: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const kids = useFolderChildren(id, open);
  const drop = useFolderDrop({ id, name, canCreate });
  const active = pathname === `/files/${id}`;
  return (
    <li role="treeitem" aria-expanded={open} aria-selected={active}>
      <div
        className={cn(
          'flex items-center rounded-md text-[13px] text-muted hover:bg-surface-2',
          active && 'bg-accent-soft font-medium text-accent-soft-fg',
          drop.over && 'ring-2 ring-accent',
        )}
        style={{ paddingLeft: depth * 12 }}
        {...drop.handlers}
        data-testid="tree-node"
        data-folder-id={id}
      >
        <button
          type="button"
          aria-label={`${open ? 'Collapse' : 'Expand'} ${name}`}
          className="grid size-6 place-items-center rounded-sm hover:text-text"
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronRight
            className={cn('size-3.5 transition-transform', open && 'rotate-90')}
            aria-hidden
          />
        </button>
        <Link
          href={`/files/${id}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-2"
          aria-current={active ? 'page' : undefined}
        >
          <Folder className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{name}</span>
        </Link>
      </div>
      {open && (
        <ul role="group">
          {kids.isPending ? (
            <li
              className="px-3 py-1 text-xs text-faint"
              style={{ paddingLeft: (depth + 1) * 12 + 24 }}
            >
              Loading…
            </li>
          ) : kids.data && kids.data.items.length === 0 ? (
            <li
              className="px-3 py-1 text-xs text-faint"
              style={{ paddingLeft: (depth + 1) * 12 + 24 }}
            >
              No subfolders
            </li>
          ) : (
            kids.data?.items.map((c) => (
              <Node
                key={c.id}
                id={c.id}
                name={c.name}
                depth={depth + 1}
                canCreate={can(c.permissions, 'create_child')}
              />
            ))
          )}
        </ul>
      )}
    </li>
  );
}

/** Lazy folder tree under "My Files". Folders are also drop targets (move / copy / upload). */
export function FolderTree() {
  const root = useRootFolder();
  const kids = useFolderChildren(root.data?.id, true);
  if (!root.data || !kids.data) return null;
  return (
    <ul
      role="tree"
      aria-label="Folders"
      className="mt-0.5 ml-1 grid gap-px border-l border-line pl-1"
    >
      {kids.data.items.map((c) => (
        <Node
          key={c.id}
          id={c.id}
          name={c.name}
          depth={0}
          canCreate={can(c.permissions, 'create_child')}
        />
      ))}
    </ul>
  );
}

/** Pinned folders and starred files from GET /favorites. */
export function QuickAccessList() {
  const q = useFavorites(8);
  if (!q.data || q.data.items.length === 0) return null;
  return (
    <ul
      aria-label="Pinned items"
      className="mt-0.5 ml-1 grid gap-px border-l border-line pl-1"
      data-testid="quick-access-list"
    >
      {q.data.items.map((i) => (
        <li key={i.id}>
          <Link
            href={i.kind === 'folder' ? `/files/${i.id}` : `/documents/${i.id}`}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-muted hover:bg-surface-2 hover:text-text"
          >
            {i.kind === 'folder' ? (
              <Folder className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <Star className="size-3.5 shrink-0" aria-hidden />
            )}
            <span className="truncate">{i.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
