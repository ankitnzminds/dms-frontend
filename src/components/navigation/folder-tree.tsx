'use client';

import { ChevronRight, Lock } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ContextMenuRoot, ContextMenuTrigger } from '@/components/explorer/menu-render';
import { useExplorerOps } from '@/components/explorer/ops';
import { NewFolderDialog } from '@/components/file-browser/name-dialogs';
import { ItemIcon } from '@/components/file-browser/file-bits';
import { ResourceActionsProvider } from '@/components/explorer/resource-actions';
import { TreeNodeMenu } from '@/components/navigation/tree-node-menu';
import { useUploadPickers } from '@/components/upload/pickers';
import { isCopyDrop, readDragPayload } from '@/features/explorer/dnd';
import { useFavorites, useFolderChildren } from '@/features/explorer/hooks';
import { treeKeyHandler, useTreeOpen } from '@/features/explorer/tree-state';
import { useFolder, useRecent, useRootFolder } from '@/features/files/hooks';
import { folderToTreeItem } from '@/features/explorer/resource';
import { useReceivedShares, useSentShares } from '@/features/sharing/hooks';
import { dragHasFiles, INTERNAL_DND } from '@/features/upload/read-entries';
import type { TreeItem } from '@/lib/api-client';
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
  item,
  parentId,
  depth,
  scope,
}: {
  item: TreeItem;
  parentId: string;
  depth: number;
  /** Which sidebar tree this node is in, so the same folder listed in two trees toggles separately. */
  scope: 'my' | 'team' | 'with' | 'by';
}) {
  const { id, name } = item;
  const canCreate = can(item.permissions, 'upload');
  const pathname = usePathname();
  // Per-node, kept across navigation (see tree-state); one node's state never touches another's.
  const [open, setOpen] = useTreeOpen(`folder:${scope}:${id}`);
  const keys = treeKeyHandler(open, setOpen);
  const [newFolder, setNewFolder] = useState(false);
  // Always asked (cached for 20 s) so the arrow only appears on folders that really have subfolders
  // you can see. Until it is known the arrow's place stays empty, so rows do not jump.
  const kids = useFolderChildren(id, true);
  const hasKids = kids.data ? kids.data.items.length > 0 : undefined;
  const expanded = open && hasKids !== false;
  const drop = useFolderDrop({ id, name, canCreate });
  const active = pathname === `/files/${id}`;
  return (
    <li role="treeitem" aria-expanded={hasKids ? expanded : undefined} aria-selected={active}>
      <ContextMenuRoot>
        <ContextMenuTrigger asChild>
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
            {hasKids ? (
              <button
                type="button"
                aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}
                className="grid size-6 place-items-center rounded-sm hover:text-text"
                aria-expanded={expanded}
                onClick={() => setOpen(!open)}
                onKeyDown={keys}
              >
                <ChevronRight
                  className={cn('size-3.5 transition-transform', expanded && 'rotate-90')}
                  aria-hidden
                />
              </button>
            ) : (
              <span className="size-6 shrink-0" aria-hidden />
            )}
            <Link
              href={`/files/${id}`}
              onKeyDown={keys}
              className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-2"
              aria-current={active ? 'page' : undefined}
            >
              <ItemIcon kind="folder" size={16} />
              <span className="truncate">{name}</span>
              {item.locked && (
                <Lock
                  className="size-3 shrink-0 text-warn"
                  aria-label="Locked"
                  data-testid="tree-lock"
                />
              )}
            </Link>
          </div>
        </ContextMenuTrigger>
        <TreeNodeMenu item={item} parentId={parentId} onNewFolder={() => setNewFolder(true)} />
      </ContextMenuRoot>
      {newFolder && (
        <NewFolderDialog parentId={id} open onOpenChange={(o) => !o && setNewFolder(false)} />
      )}
      {expanded && (
        <ul role="group">
          {kids.isPending ? (
            <li
              className="px-3 py-1 text-xs text-faint"
              style={{ paddingLeft: (depth + 1) * 12 + 24 }}
            >
              Loading…
            </li>
          ) : (
            kids.data?.items.map((c) => (
              <Node key={c.id} item={c} parentId={id} depth={depth + 1} scope={scope} />
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
    <ResourceActionsProvider>
      <ul
        role="tree"
        aria-label="Folders"
        className="mt-0.5 ml-1 grid gap-px border-l border-line pl-1"
      >
        {kids.data.items.map((c) => (
          <Node key={c.id} item={c} parentId={root.data.id} depth={0} scope="my" />
        ))}
      </ul>
    </ResourceActionsProvider>
  );
}

/** Team Folders in the sidebar: the same tree nodes as My Files (expand, drop targets, context menu). */
export function TeamFolderTree() {
  const root = useRootFolder();
  const kids = useFolderChildren(root.data?.id, true);
  const teams = (kids.data?.items ?? []).filter((i) => i.is_team_folder);
  if (!root.data || teams.length === 0) return null;
  return (
    <ResourceActionsProvider>
      <ul
        role="tree"
        aria-label="Team folders"
        className="mt-0.5 ml-1 grid gap-px border-l border-line pl-1"
      >
        {teams.map((t) => (
          <Node key={t.id} item={t} parentId={root.data.id} depth={0} scope="team" />
        ))}
      </ul>
    </ResourceActionsProvider>
  );
}

/** One thing shared with me / by me, shown at the top of its sidebar tree. */
export interface SharedRoot {
  kind: 'folder' | 'document';
  id: string;
  name: string;
  contentType?: string | null;
  /** When it was shared (ISO); the tree lists the most recent share first. */
  at: string;
}

/** One entry per item (its latest share), newest first. */
function uniqueRoots(list: SharedRoot[]): SharedRoot[] {
  const latest = new Map<string, SharedRoot>();
  for (const r of list) {
    const cur = latest.get(r.id);
    if (!cur || r.at > cur.at) latest.set(r.id, r);
  }
  return [...latest.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** Active shares others made with me (first 30), as tree roots. */
export function useSharedWithMeRoots(): { roots: SharedRoot[]; total: number } {
  const q = useReceivedShares({ includeInactive: false, limit: 30, offset: 0 });
  const roots = uniqueRoots(
    (q.data?.items ?? [])
      .filter((s) => s.status === 'active')
      .map((s) => ({
        kind: s.resource_type,
        id: s.resource_id,
        name: s.name,
        contentType: s.content_type,
        at: s.shared_at,
      })),
  );
  return { roots, total: q.data?.total ?? roots.length };
}

/** Items I have shared and the share is still active (first 30), as tree roots. */
export function useSharedByMeRoots(): { roots: SharedRoot[]; total: number } {
  const q = useSentShares({ scope: 'mine', includeInactive: false, limit: 30, offset: 0 });
  const roots = uniqueRoots(
    (q.data?.items ?? [])
      .filter((s) => s.status === 'active')
      .map((s) => ({
        kind: s.resource_type,
        id: s.resource_id,
        name: s.resource_name ?? 'Untitled',
        at: s.created_at,
      })),
  );
  return { roots, total: q.data?.total ?? roots.length };
}

// A shared folder is an ordinary tree node (expand, drop target, right-click) once its real permissions
// are loaded; if the folder can no longer be opened it simply is not listed.
function SharedFolder({ r, scope }: { r: SharedRoot; scope: 'with' | 'by' }) {
  const f = useFolder(r.id);
  if (!f.data) return null;
  return <Node item={folderToTreeItem(f.data)} parentId="" depth={0} scope={scope} />;
}

function SharedFile({ r }: { r: SharedRoot }) {
  return (
    <li>
      <Link
        href={`/documents/${r.id}`}
        className="ml-6 flex min-w-0 items-center gap-1.5 rounded-md py-1 pr-2 text-[13px] text-muted hover:bg-surface-2 hover:text-text"
        title={r.name}
      >
        <ItemIcon kind="document" name={r.name} contentType={r.contentType} size={16} />
        <span className="truncate">{r.name}</span>
      </Link>
    </li>
  );
}

/** The sidebar tree under "Shared with me" / "Shared by me": folders expand like My Files, files are leaves. */
const SHARED_PREVIEW = 5;

export function SharedTree({
  roots,
  total,
  scope,
  label,
  viewAllHref,
}: {
  roots: SharedRoot[];
  total: number;
  scope: 'with' | 'by';
  label: string;
  viewAllHref: string;
}) {
  if (roots.length === 0) return null;
  const count = Math.max(total, roots.length);
  return (
    <ResourceActionsProvider>
      <ul
        role="tree"
        aria-label={label}
        className="mt-0.5 ml-1 grid gap-px border-l border-line pl-1"
      >
        {roots
          .slice(0, SHARED_PREVIEW)
          .map((r) =>
            r.kind === 'folder' ? (
              <SharedFolder key={r.id} r={r} scope={scope} />
            ) : (
              <SharedFile key={r.id} r={r} />
            ),
          )}
        {count > SHARED_PREVIEW && (
          <li>
            <Link
              href={viewAllHref}
              className="ml-6 flex items-center rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-surface-2"
              data-testid={`${scope}-view-all`}
            >
              View all ({count})
            </Link>
          </li>
        )}
      </ul>
    </ResourceActionsProvider>
  );
}

const SIDEBAR_PREVIEW = 10;

/** Short preview list in the sidebar (max 10 items) with a "View all" link to the full page. */
export function SidebarPreview({
  items,
  total,
  label,
  testId,
  viewAllHref,
}: {
  items: TreeItem[];
  total: number;
  label: string;
  testId: string;
  viewAllHref: string;
}) {
  if (items.length === 0) return null;
  return (
    <ul
      aria-label={label}
      className="mt-0.5 ml-1 grid gap-px border-l border-line pl-1"
      data-testid={testId}
    >
      {items.slice(0, SIDEBAR_PREVIEW).map((i) => (
        <li key={i.id}>
          <Link
            href={i.kind === 'folder' ? `/files/${i.id}` : `/documents/${i.id}`}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-muted hover:bg-surface-2 hover:text-text"
          >
            <ItemIcon kind={i.kind} contentType={i.content_type} name={i.name} size={16} />
            <span className="truncate">{i.name}</span>
            {i.locked && <Lock className="size-3 shrink-0 text-warn" aria-label="Locked" />}
          </Link>
        </li>
      ))}
      {total > SIDEBAR_PREVIEW && (
        <li>
          <Link
            href={viewAllHref}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-surface-2"
            data-testid={`${testId}-view-all`}
          >
            View all ({total})
          </Link>
        </li>
      )}
    </ul>
  );
}

/** Pinned folders and starred files from GET /favorites (first 10; the full list is on /starred). */
export function QuickAccessList() {
  const q = useFavorites(SIDEBAR_PREVIEW);
  if (!q.data) return null;
  return (
    <SidebarPreview
      items={q.data.items}
      total={q.data.total}
      label="Pinned items"
      testId="quick-access-list"
      viewAllHref="/starred"
    />
  );
}

/** Recently opened or changed items (first 10; the full list is on /recent). */
export function RecentList() {
  const q = useRecent(SIDEBAR_PREVIEW, 0);
  if (!q.data) return null;
  return (
    <SidebarPreview
      items={q.data.items}
      total={q.data.total}
      label="Recent items"
      testId="recent-list"
      viewAllHref="/recent"
    />
  );
}
