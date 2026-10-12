'use client';

import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { FolderOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { NewFolderDialog } from '@/components/file-browser/name-dialogs';
import { ItemActionsProvider } from '@/components/file-browser/item-actions';
import { ProtectionBadges } from '@/components/file-browser/protection-badges';
import { PathTrail } from '@/components/navigation/path-trail';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { DropZone } from '@/components/upload/drop-zone';
import { useUploadPickers } from '@/components/upload/pickers';
import { useChildren, useFolder } from '@/features/files/hooks';
import { useProtection } from '@/features/governance/hooks';
import { clearClipboard, setClipboard, useClipboard } from '@/features/explorer/clipboard';
import { readDragPayload, writeDragPayload, isCopyDrop } from '@/features/explorer/dnd';
import { HoverToolbar } from './hover-toolbar';
import { useResourceActions } from './resource-actions';
import {
  buildMenu,
  canLock,
  canUnlock,
  type ExplorerAction,
  type MenuContext,
} from '@/features/explorer/menu';
import { useViewPrefs } from '@/features/explorer/prefs';
import { useSelection } from '@/features/explorer/selection';
import { dragHasFiles, INTERNAL_DND } from '@/features/upload/read-entries';
import { useChatLauncher } from '@/features/chat/launcher';
import type { TreeItem } from '@/lib/api-client';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { PaginationBar } from '@/components/file-browser/pagination-bar';
import { useExplorerOps } from './ops';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ContextMenuContent,
  ContextMenuRoot,
  ContextMenuTrigger,
  DropdownMenuEntries,
  DropdownRoot,
  DropdownTrigger,
} from './menu-render';
import { PropertiesPanel } from './properties-panel';
import { ExplorerHeader, type ToolbarState } from './toolbar';
import { ItemsView } from './views';

const PAGE_SIZE = 100;

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      el.isContentEditable)
  );
};

function ExplorerBody({ folderId }: { folderId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const resource = useResourceActions();
  const ops = useExplorerOps();
  const pickers = useUploadPickers();
  const clipboard = useClipboard();
  const chat = useChatLauncher();
  const { setDefaultTarget } = pickers;
  useEffect(() => {
    setDefaultTarget(folderId);
    return () => setDefaultTarget(null);
  }, [folderId, setDefaultTarget]);

  const folder = useFolder(folderId);
  const protection = useProtection('folder', folderId);
  const { prefs, update } = useViewPrefs(folderId);
  const [offset, setOffset] = useState(0);
  const children = useChildren(folderId, {
    limit: PAGE_SIZE,
    offset,
    sort: prefs.sort,
    order: prefs.order,
  });

  const items = useMemo(
    () =>
      [...(children.data?.items ?? [])].sort((a, b) =>
        a.kind === b.kind ? 0 : a.kind === 'folder' ? -1 : 1,
      ),
    [children.data],
  );
  const order = useMemo(() => items.map((i) => i.id), [items]);
  const sel = useSelection(order);
  const selItems = useMemo(() => items.filter((i) => sel.ids.has(i.id)), [items, sel.ids]);

  const [newFolderIn, setNewFolderIn] = useState<string | null>(null);
  const detailsParam = useSearchParams().get('details');
  const [propsOpen, setPropsOpen] = useState(
    detailsParam === 'comments' || detailsParam === 'properties',
  );
  const [menuCtx, setMenuCtx] = useState<{ target: MenuContext['target']; items: TreeItem[] }>({
    target: 'background',
    items: [],
  });
  const container = useRef<HTMLDivElement>(null);

  const f = folder.data;
  const canFolder = can(f?.permissions, 'create_folder');
  const canFile = can(f?.permissions, 'create_file');
  const canUpload = can(f?.permissions, 'upload');
  const canCreate = canFolder || canFile || canUpload;
  const cutIds = useMemo(
    () =>
      new Set(
        clipboard?.op === 'cut' && clipboard.sourceFolderId === folderId
          ? clipboard.items.map((i) => i.id)
          : [],
      ),
    [clipboard, folderId],
  );

  const named = (xs: TreeItem[]) => xs.map(({ kind, id, name }) => ({ kind, id, name }));
  const here = { id: folderId, name: f?.name ?? 'this folder' };

  const openItem = useCallback(
    (t: TreeItem, newTab = false) => {
      const href = t.kind === 'folder' ? `/files/${t.id}` : `/documents/${t.id}`;
      if (newTab) window.open(href, '_blank', 'noopener,noreferrer');
      else router.push(href);
    },
    [router],
  );

  const act = useCallback(
    (a: ExplorerAction, itemsArg: TreeItem[] = selItems) => {
      const one = itemsArg[0];
      switch (a) {
        case 'cut':
        case 'copy':
          if (itemsArg.length === 0) return;
          setClipboard({ op: a, items: named(itemsArg), sourceFolderId: folderId });
          toast.message(
            `${itemsArg.length} item${itemsArg.length === 1 ? '' : 's'} ${a === 'cut' ? 'cut' : 'copied'}. Paste into a folder to ${a === 'cut' ? 'move' : 'copy'} ${itemsArg.length === 1 ? 'it' : 'them'}.`,
          );
          return;
        case 'paste': {
          const t =
            itemsArg.length === 1 && itemsArg[0]!.kind === 'folder' && menuCtx.target === 'item'
              ? itemsArg[0]!
              : null;
          void ops.paste(t ? { id: t.id, name: t.name } : here);
          return;
        }
        case 'duplicate':
          if (one) void ops.transfer('copy', named([one]), here, { onConflict: 'rename' });
          return;
        case 'properties':
          setPropsOpen(true);
          if (one) sel.setOnly(one.id);
          return;
        case 'new-folder':
          setNewFolderIn(
            one && menuCtx.target === 'item' && one.kind === 'folder' ? one.id : folderId,
          );
          return;
        case 'upload-files':
          pickers.pickFiles(
            one && menuCtx.target === 'item' && one.kind === 'folder' ? one.id : folderId,
          );
          return;
        case 'create-file':
          resource.createFileIn(
            one && menuCtx.target === 'item' && one.kind === 'folder' ? one.id : folderId,
          );
          return;
        case 'upload-folder':
          pickers.pickFolder(
            one && menuCtx.target === 'item' && one.kind === 'folder' ? one.id : folderId,
          );
          return;
        case 'refresh':
          for (const k of ['children', 'folder', 'tree', 'properties', 'protection'])
            void qc.invalidateQueries({ queryKey: [k] });
          return;
        case 'select-all':
          sel.all();
          return;
        case 'clear-selection':
          sel.clear();
          return;
        default:
          if (a.startsWith('sort:')) {
            const key = a.slice(5) as typeof prefs.sort;
            update(
              prefs.sort === key
                ? { order: prefs.order === 'asc' ? 'desc' : 'asc' }
                : { sort: key, order: 'asc' },
            );
          } else if (a.startsWith('view:')) update({ view: a.slice(5) as typeof prefs.view });
          else resource.act(a, itemsArg, folderId);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selItems, folderId, f?.name, menuCtx, prefs, clipboard, ops, resource, sel],
  );

  /* ------------------------------ keyboard ------------------------------ */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (isTyping(e.target) || !container.current?.contains(e.target as Node)) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    const grid = prefs.view === 'tiles' || prefs.view === 'grid';
    if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'ArrowLeft' || k === 'ArrowRight') {
      if (!grid && (k === 'ArrowLeft' || k === 'ArrowRight')) return;
      e.preventDefault();
      sel.move(
        k === 'ArrowDown' ? 'down' : k === 'ArrowUp' ? 'up' : k === 'ArrowLeft' ? 'left' : 'right',
        {
          shift: e.shiftKey,
          ctrl: mod,
          step: grid && (k === 'ArrowDown' || k === 'ArrowUp') ? 4 : 1,
        },
      );
    } else if (k === 'Home' || k === 'End') {
      e.preventDefault();
      sel.move(k === 'Home' ? 'home' : 'end', { shift: e.shiftKey });
    } else if (k === 'Enter' && e.altKey) {
      e.preventDefault();
      setPropsOpen((o) => !o);
    } else if (k === 'Enter') {
      const t = items.find((i) => i.id === sel.focus) ?? selItems[0];
      if (t) {
        e.preventDefault();
        openItem(t);
      }
    } else if (k === 'F2' && selItems.length === 1) {
      e.preventDefault();
      act('rename');
    } else if (k === 'Delete' && selItems.length) {
      e.preventDefault();
      act('delete');
    } else if (mod && k.toLowerCase() === 'a') {
      e.preventDefault();
      sel.all();
    } else if (mod && k.toLowerCase() === 'c' && selItems.length) {
      e.preventDefault();
      act('copy');
    } else if (mod && k.toLowerCase() === 'x' && selItems.length) {
      e.preventDefault();
      act('cut');
    } else if (mod && k.toLowerCase() === 'v') {
      e.preventDefault();
      setMenuCtx({ target: 'background', items: [] });
      void ops.paste(here);
    } else if (mod && e.shiftKey && k.toLowerCase() === 'n' && canFolder) {
      e.preventDefault();
      setNewFolderIn(folderId);
    } else if (k === 'F5') {
      e.preventDefault();
      act('refresh');
    } else if ((k === 'Backspace' || (e.altKey && k === 'ArrowUp')) && f?.parent_folder_id) {
      e.preventDefault();
      router.push(`/files/${f.parent_folder_id}`);
    } else if (k === 'Escape') {
      if (sel.ids.size) sel.clear();
      else if (clipboard) clearClipboard();
    }
  };

  const rowMenu = (t: TreeItem) => (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Actions for ${t.name}`}
          onClick={(e) => {
            e.stopPropagation();
            sel.setOnly(t.id);
            setMenuCtx({ target: 'item', items: [t] });
          }}
        >
          <MoreHorizontal />
        </Button>
      </DropdownTrigger>
      <DropdownMenuEntries
        entries={buildMenu({
          target: 'item',
          items: [t],
          folderPermissions: f?.permissions ?? [],
          currentFolderName: f?.name ?? '',
          clipboard,
          sort: prefs.sort,
          view: prefs.view,
        })}
        onRun={(a) => act(a, [t])}
      />
    </DropdownRoot>
  );

  /* ------------------------------ context menu ------------------------------ */
  const onContextMenuCapture = (e: React.MouseEvent) => {
    const row = (e.target as HTMLElement).closest('[data-item-id]') as HTMLElement | null;
    if (row) {
      const id = row.dataset.itemId!;
      if (sel.ids.has(id) && sel.ids.size > 1) setMenuCtx({ target: 'selection', items: selItems });
      else {
        sel.setOnly(id);
        const t = items.find((i) => i.id === id);
        setMenuCtx({ target: 'item', items: t ? [t] : [] });
      }
    } else if (e.target === container.current && sel.focus && sel.ids.size) {
      // keyboard-invoked (Context Menu key / Shift+F10) on the focused list
      setMenuCtx(
        sel.ids.size > 1
          ? { target: 'selection', items: selItems }
          : { target: 'item', items: selItems },
      );
    } else {
      sel.clear();
      setMenuCtx({ target: 'background', items: [] });
    }
  };

  const entries = useMemo(
    () =>
      buildMenu({
        target: menuCtx.target,
        items: menuCtx.items,
        folderPermissions: f?.permissions ?? [],
        currentFolderName: f?.name ?? '',
        clipboard,
        sort: prefs.sort,
        view: prefs.view,
      }),
    [menuCtx, f, clipboard, prefs.sort, prefs.view],
  );

  /* ------------------------------ drag and drop ------------------------------ */
  const onDragStartItem = (t: TreeItem, e: React.DragEvent) => {
    const list = sel.ids.has(t.id) ? selItems : [t];
    const canMove = list.every((i) => can(i.permissions, 'move'));
    const canCopy = list.every((i) => can(i.permissions, 'copy'));
    if (!canMove && !canCopy) {
      e.preventDefault();
      toast.message('You do not have permission to move or copy this.');
      return;
    }
    if (!sel.ids.has(t.id)) sel.setOnly(t.id);
    writeDragPayload(
      e.dataTransfer,
      named(list),
      canMove && canCopy ? 'copyMove' : canMove ? 'move' : 'copy',
    );
  };
  const onDropOnFolder = (target: TreeItem, e: React.DragEvent) => {
    if (dragHasFiles(e.dataTransfer) && !e.dataTransfer.types.includes(INTERNAL_DND)) {
      if (!can(target.permissions, 'upload')) {
        toast.error(`You cannot add items to "${target.name}".`);
        return;
      }
      void pickers.dropInto(e.dataTransfer, target.id);
      return;
    }
    const payload = readDragPayload(e.dataTransfer);
    if (!payload) return;
    ops.drop(isCopyDrop(e) ? 'copy' : 'move', payload, { id: target.id, name: target.name });
  };

  /* ------------------------------ toolbar state ------------------------------ */
  const single = selItems.length === 1;
  const noSel = 'Select an item first.';
  const menuFor = (xs: TreeItem[]) =>
    buildMenu({
      target: xs.length > 1 ? 'selection' : 'item',
      items: xs,
      folderPermissions: f?.permissions ?? [],
      currentFolderName: '',
      clipboard,
      sort: prefs.sort,
      view: prefs.view,
    });
  const reasonOf = (id: ExplorerAction) => {
    if (!selItems.length) return noSel;
    const m = menuFor(selItems).find((e) => e.id === id);
    return !m
      ? 'Not available for this selection.'
      : m.enabled
        ? null
        : (m.reason ?? 'Not available.');
  };
  const tb: ToolbarState = {
    canCreate,
    canFolder,
    canFile,
    canUpload,
    hasSelection: selItems.length > 0,
    single,
    createReason: canCreate ? null : 'You cannot add items to this folder.',
    cut: reasonOf('cut'),
    copy: reasonOf('copy'),
    paste: !clipboard
      ? 'The clipboard is empty.'
      : canCreate
        ? null
        : 'You cannot add items to this folder.',
    rename: !single
      ? selItems.length
        ? 'Rename works on one item at a time.'
        : noSel
      : reasonOf('rename'),
    share: !single ? (selItems.length ? 'Share one item at a time.' : noSel) : reasonOf('share'),
    download: !single
      ? selItems.length
        ? 'Download one file at a time.'
        : noSel
      : reasonOf('download'),
    del: reasonOf('delete'),
    lock:
      selItems.length && selItems.some(canLock)
        ? null
        : (reasonOf('lock') ?? 'Nothing selected can be locked.'),
    unlock:
      selItems.length && selItems.some(canUnlock)
        ? null
        : (reasonOf('unlock') ?? 'Nothing selected is locked by you.'),
    access: !single
      ? selItems.length
        ? 'Manage permissions on one item at a time.'
        : noSel
      : reasonOf('access'),
  };

  if (folder.isError) return <ErrorState error={folder.error} onRetry={() => folder.refetch()} />;

  const propsTarget = single
    ? { kind: selItems[0]!.kind, id: selItems[0]!.id }
    : selItems.length === 0 && f
      ? { kind: 'folder' as const, id: f.id }
      : null;

  return (
    <>
      <ExplorerHeader
        title={f?.name ?? 'Loading…'}
        badges={<ProtectionBadges protection={protection.data} />}
        trail={f && f.breadcrumb.length > 0 ? <PathTrail segments={f.breadcrumb} /> : undefined}
        itemCount={children.data ? children.data.total : null}
        st={tb}
        prefs={prefs}
        onPrefs={update}
        onAsk={chat.enabled ? () => chat.open({ folderId, label: f?.name }) : undefined}
        propertiesOpen={propsOpen}
        selectionMenu={selItems.length ? menuFor(selItems) : undefined}
        onSelectionMenu={(a) => {
          setMenuCtx({ target: single ? 'item' : 'selection', items: selItems });
          act(a, selItems);
        }}
        selectionCount={selItems.length}
        hasClipboard={!!clipboard}
        onSearch={(q) => router.push(`/search?q=${encodeURIComponent(q)}&folder=${folderId}`)}
        onAction={(a) => {
          setMenuCtx({ target: 'background', items: [] });
          if (a === 'properties') return setPropsOpen((o) => !o);
          if (a === 'paste') return void ops.paste(here);
          if (a === 'upload-files') return pickers.pickFiles(folderId);
          if (a === 'upload-folder') return pickers.pickFolder(folderId);
          if (a === 'new-folder') return setNewFolderIn(folderId);
          if (a === 'create-file') return resource.createFileIn(folderId);
          if (a === 'clear-selection') return sel.clear();
          if (
            a === 'delete' ||
            a === 'cut' ||
            a === 'copy' ||
            a === 'download' ||
            a === 'rename' ||
            a === 'share' ||
            a === 'access' ||
            a === 'lock' ||
            a === 'unlock'
          )
            setMenuCtx({ target: single ? 'item' : 'selection', items: selItems });
          act(a);
        }}
      />

      <div className={cn('grid gap-3', propsOpen && 'lg:grid-cols-[minmax(0,1fr)_22rem]')}>
        <ContextMenuRoot>
          <ContextMenuTrigger asChild>
            <div
              ref={container}
              tabIndex={0}
              role="application"
              aria-label="File manager"
              aria-describedby="explorer-help"
              className="min-h-[calc(100dvh-15.5rem)] rounded-lg border border-line bg-surface outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              onKeyDown={onKeyDown}
              onContextMenuCapture={onContextMenuCapture}
              onClick={(e) => {
                if (!(e.target as HTMLElement).closest('[data-item-id]')) sel.clear();
              }}
              data-testid="explorer"
            >
              <p id="explorer-help" className="sr-only">
                Use arrow keys to move, Enter to open, F2 to rename, Delete to move to trash,
                Control C, X and V to copy, cut and paste, Alt Enter for properties, and the Context
                Menu key for actions.
              </p>
              <DropZone
                folderId={folderId}
                enabled={canCreate}
                className="min-h-[calc(100dvh-15.5rem)]"
              >
                {folder.isPending || children.isPending ? (
                  <SkeletonRows rows={7} label="Loading files" />
                ) : children.isError ? (
                  <ErrorState error={children.error} onRetry={() => children.refetch()} />
                ) : items.length === 0 ? (
                  <EmptyState
                    icon={FolderOpen}
                    title="This folder is empty"
                    description={
                      canCreate
                        ? 'Drag files or folders here, or use Upload and New folder to get started.'
                        : 'There is nothing here that you can see yet.'
                    }
                  />
                ) : (
                  <ItemsView
                    items={items}
                    selected={sel.ids}
                    focus={sel.focus}
                    cutIds={cutIds}
                    view={prefs.view}
                    columns={prefs.columns}
                    sort={prefs.sort}
                    order={prefs.order}
                    onSort={(k) =>
                      update(
                        prefs.sort === k
                          ? { order: prefs.order === 'asc' ? 'desc' : 'asc' }
                          : { sort: k, order: 'asc' },
                      )
                    }
                    onRowClick={(id, e) => {
                      sel.click(id, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
                      container.current?.focus();
                    }}
                    onOpen={(t) => openItem(t)}
                    renderMenu={rowMenu}
                    renderHover={(t, forceVisible) => (
                      <HoverToolbar
                        item={t}
                        forceVisible={forceVisible}
                        entries={buildMenu({
                          target: 'item',
                          items: [t],
                          folderPermissions: f?.permissions ?? [],
                          currentFolderName: f?.name ?? '',
                          clipboard,
                          sort: prefs.sort,
                          view: prefs.view,
                        })}
                        onRun={(a, item) => {
                          sel.setOnly(item.id);
                          setMenuCtx({ target: 'item', items: [item] });
                          act(a, [item]);
                        }}
                        overflow={rowMenu(t)}
                      />
                    )}
                    onDragStartItem={onDragStartItem}
                    onDropOnFolder={onDropOnFolder}
                  />
                )}
                {children.data && (
                  <PaginationBar
                    total={children.data.total}
                    limit={PAGE_SIZE}
                    offset={offset}
                    count={items.length}
                    onOffsetChange={(o) => (setOffset(o), sel.clear())}
                  />
                )}
              </DropZone>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent entries={entries} onRun={(a) => act(a, menuCtx.items)} />
        </ContextMenuRoot>

        {propsOpen && (
          <div className="lg:sticky lg:top-0 lg:self-start">
            <PropertiesPanel
              target={propsTarget}
              selectionCount={selItems.length}
              initialTab={detailsParam === 'comments' ? 'comments' : 'properties'}
              onClose={() => setPropsOpen(false)}
            />
          </div>
        )}
      </div>

      {newFolderIn && (
        <NewFolderDialog
          parentId={newFolderIn}
          open
          onOpenChange={(o) => !o && setNewFolderIn(null)}
        />
      )}
      {resource.dialogs}
    </>
  );
}

export function Explorer({ folderId }: { folderId: string }) {
  return (
    <ItemActionsProvider currentFolderId={folderId}>
      <ExplorerBody folderId={folderId} />
    </ItemActionsProvider>
  );
}
