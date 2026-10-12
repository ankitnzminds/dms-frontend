'use client';

import { MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ItemActionsProvider, useItemActions } from '@/components/file-browser/item-actions';
import { NewFileDialog, NewFolderDialog } from '@/components/file-browser/name-dialogs';
import { VersionsPanel } from '@/components/file-browser/versions-panel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent } from '@/components/ui/dialog';
import { useUploadPickers } from '@/components/upload/pickers';
import { setClipboard, useClipboard } from '@/features/explorer/clipboard';
import type { LockTarget } from '@/features/explorer/hooks';
import { buildMenu, canLock, canUnlock, type ExplorerAction } from '@/features/explorer/menu';
import { LockDialog, UnlockDialog } from '@/components/file-browser/lock-dialog';
import { toActionItem, useResolvedItem, type ResourceRef } from '@/features/explorer/resource';
import { WorkflowWizard, type WorkflowTarget } from '@/features/automations/wizard';
import { downloadAsPdf, downloadDocument, downloadFolderZip } from '@/features/files/download';
import {
  useColorTag,
  useDocument,
  useFolder,
  useToggleStar,
  type ColorTag,
} from '@/features/files/hooks';
import { RequestAccessDialog } from '@/features/requests/request-access-dialog';
import { friendlyMessage, type TreeItem } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { HoverToolbar } from './hover-toolbar';
import {
  ContextMenuContent,
  ContextMenuRoot,
  ContextMenuTrigger,
  DropdownMenuEntries,
  DropdownRoot,
  DropdownTrigger,
} from './menu-render';
import { useExplorerOps } from './ops';

/**
 * ONE dispatcher for what a menu entry does to one or more resources. The folder view, Recent, Starred,
 * Team Folders and Shared with me all call this, so a given action behaves identically everywhere. It only
 * issues the same API calls as before: the server authorizes every one of them again.
 *
 * Returns false for entries that only make sense inside a folder view (select all, sort, view, refresh,
 * upload folder, make a copy, properties of the open folder); the folder view handles those itself.
 */
export function useResourceActions() {
  const router = useRouter();
  const { run } = useItemActions();
  const ops = useExplorerOps();
  const pickers = useUploadPickers();
  const star = useToggleStar();
  const colorTag = useColorTag();
  const [versionsFor, setVersionsFor] = useState<TreeItem | null>(null);
  const [requestFor, setRequestFor] = useState<TreeItem | null>(null);
  const [newFolderIn, setNewFolderIn] = useState<string | null>(null);
  const [newFileIn, setNewFileIn] = useState<string | null>(null);
  const [workflowFor, setWorkflowFor] = useState<TreeItem | null>(null);
  const [lockOp, setLockOp] = useState<null | {
    mode: 'lock' | 'unlock';
    targets: LockTarget[];
    skipped: string[];
  }>(null);
  const closeWorkflow = useCallback(() => setWorkflowFor(null), []);

  const act = useCallback(
    (a: ExplorerAction, items: TreeItem[], startFolderId?: string): boolean => {
      const one = items[0];
      const href = (t: TreeItem) => (t.kind === 'folder' ? `/files/${t.id}` : `/documents/${t.id}`);
      const named = items.map(({ kind, id, name }) => ({ kind, id, name }));
      switch (a) {
        case 'open':
          if (one) router.push(href(one));
          return true;
        case 'open-tab':
          if (one) window.open(href(one), '_blank', 'noopener,noreferrer');
          return true;
        case 'preview':
        case 'rename':
        case 'share':
        case 'access':
          if (one) run(a, toActionItem(one));
          return true;
        case 'download':
          if (one) {
            const done =
              one.kind === 'folder'
                ? downloadFolderZip(one.id, one.name).then(({ skipped }) => {
                    if (skipped > 0)
                      toast.message(
                        `${skipped} item${skipped === 1 ? '' : 's'} left out because you cannot download ${skipped === 1 ? 'it' : 'them'}.`,
                      );
                  })
                : downloadDocument(one.id);
            done.catch((e) => toast.error(friendlyMessage(e)));
          }
          return true;
        case 'cut':
        case 'copy':
          if (!items.length) return true;
          setClipboard({ op: a, items: named, sourceFolderId: '' });
          toast.message(
            `${items.length} item${items.length === 1 ? '' : 's'} ${a === 'cut' ? 'cut' : 'copied'}. Paste into a folder to ${a === 'cut' ? 'move' : 'copy'} ${items.length === 1 ? 'it' : 'them'}.`,
          );
          return true;
        case 'paste':
          if (one?.kind === 'folder') void ops.paste({ id: one.id, name: one.name });
          return true;
        case 'copy-link':
          if (one)
            navigator.clipboard
              ?.writeText(`${window.location.origin}${href(one)}`)
              .then(() => toast.success('Link copied. It only works for people who have access.'))
              .catch(() => toast.error('Could not copy the link.'));
          return true;
        case 'move-to':
          if (items.length) ops.transferTo('move', named, startFolderId);
          return true;
        case 'copy-to':
          if (items.length) ops.transferTo('copy', named, startFolderId);
          return true;
        case 'versions':
          if (one) setVersionsFor(one);
          return true;
        case 'lock':
        case 'unlock': {
          const can = a === 'lock' ? canLock : canUnlock;
          const targets = items
            .filter(can)
            .map(({ kind, id, name }) => ({ kind, id, name }) as LockTarget);
          const skipped = items
            .filter((t) => !can(t))
            .map((t) =>
              a === 'lock'
                ? `${t.name} (${t.locked ? 'already locked' : 'you cannot lock it'})`
                : `${t.name} (${t.locked ? 'locked by someone else' : 'not locked'})`,
            );
          if (targets.length === 0) {
            toast.error(
              skipped.length
                ? `Nothing to ${a}: ${skipped.join('; ')}`
                : `Select something to ${a} first.`,
            );
            return true;
          }
          setLockOp({ mode: a, targets, skipped });
          return true;
        }
        case 'favorite':
        case 'unfavorite':
          if (one)
            star.mutate(
              { id: one.id, starred: a === 'favorite', kind: one.kind },
              {
                onSuccess: () =>
                  toast.success(
                    a === 'favorite'
                      ? `Added "${one.name}" to Quick Access`
                      : `Removed "${one.name}" from Quick Access`,
                  ),
                onError: (e) => toast.error(friendlyMessage(e)),
              },
            );
          return true;
        case 'delete':
          if (items.length) ops.trash(named);
          return true;
        case 'new-folder':
          if (one?.kind === 'folder') setNewFolderIn(one.id);
          return true;
        case 'create-file':
          if (one?.kind === 'folder') setNewFileIn(one.id);
          return true;
        case 'upload-files':
          if (one?.kind === 'folder') pickers.pickFiles(one.id);
          return true;
        case 'upload-folder':
          if (one?.kind === 'folder') pickers.pickFolder(one.id);
          return true;
        case 'request-access':
          if (one) setRequestFor(one);
          return true;
        case 'create-workflow':
          if (one) setWorkflowFor(one);
          return true;
        case 'export-pdf':
          if (one) {
            const id = toast.loading(`Converting "${one.name}" to PDF…`);
            downloadAsPdf(one.id, one.name)
              .then(() => toast.success('PDF downloaded', { id }))
              .catch((e) => toast.error(friendlyMessage(e), { id }));
          }
          return true;
        case 'properties':
          // Outside a folder view the details live on the item's own page.
          if (one)
            router.push(one.kind === 'folder' ? `/files/${one.id}?details=properties` : href(one));
          return true;
        default:
          if (a.startsWith('color:')) {
            const c = a.slice(6);
            if (one)
              colorTag.mutate(
                { id: one.id, kind: one.kind, color: c === 'none' ? null : (c as ColorTag) },
                { onError: (e) => toast.error(friendlyMessage(e)) },
              );
            return true;
          }
          return false;
      }
    },
    [router, run, ops, pickers, star, colorTag],
  );

  const dialogs = (
    <>
      {newFolderIn && (
        <NewFolderDialog
          parentId={newFolderIn}
          open
          onOpenChange={(o) => !o && setNewFolderIn(null)}
        />
      )}
      {lockOp?.mode === 'lock' && (
        <LockDialog
          targets={lockOp.targets}
          skipped={lockOp.skipped}
          onClose={() => setLockOp(null)}
        />
      )}
      {lockOp?.mode === 'unlock' && (
        <UnlockDialog
          targets={lockOp.targets}
          skipped={lockOp.skipped}
          onClose={() => setLockOp(null)}
        />
      )}
      {newFileIn && (
        <NewFileDialog parentId={newFileIn} open onOpenChange={(o) => !o && setNewFileIn(null)} />
      )}
      {versionsFor && (
        <Dialog open onOpenChange={(o) => !o && setVersionsFor(null)}>
          <DialogContent title={`Version history: ${versionsFor.name}`} className="max-w-3xl">
            <DialogBody>
              <VersionsPanel documentId={versionsFor.id} permissions={versionsFor.permissions} />
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}
      {workflowFor && <WorkflowForItem item={workflowFor} onClose={closeWorkflow} />}
      {requestFor && (
        <RequestAccessDialog
          kind={requestFor.kind}
          id={requestFor.id}
          name={requestFor.name}
          have={requestFor.permissions}
          onClose={() => setRequestFor(null)}
        />
      )}
    </>
  );
  return { act, dialogs, createFileIn: setNewFileIn };
}

/** Opens the existing workflow builder with this file or folder (and its location) preselected. */
function WorkflowForItem({ item, onClose }: { item: TreeItem; onClose: () => void }) {
  const folder = useFolder(item.kind === 'folder' ? item.id : undefined);
  const doc = useDocument(item.kind === 'document' ? item.id : undefined);
  const q = item.kind === 'folder' ? folder : doc;
  const target = useMemo(() => {
    const trail = q.data?.breadcrumb;
    if (!trail) return null;
    // The first segment is the organization root, which workflow paths leave out.
    const names = trail.slice(1).map((s) => s.name);
    const path = names.some((n) => !n) ? null : `/${[...names, item.name].join('/')}`;
    return { name: item.name, kind: item.kind, path } satisfies WorkflowTarget;
  }, [q.data, item.name, item.kind]);
  const failed = q.isError;
  useEffect(() => {
    if (!failed) return;
    toast.error('Could not load this item to create a workflow for it.');
    onClose();
  }, [failed, onClose]);
  if (!target) return null;
  return (
    <WorkflowWizard open onOpenChange={(o) => !o && onClose()} existing={null} target={target} />
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* List pages (Recent, Starred, Team Folders, Shared with me): provider + row shell                  */
/* ------------------------------------------------------------------------------------------------ */

const Ctx = createContext<ReturnType<typeof useResourceActions>['act'] | null>(null);
export const useResourceAct = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('Resource rows must be inside ResourceActionsProvider');
  return c;
};

function Inner({ children }: { children: React.ReactNode }) {
  const { act, dialogs } = useResourceActions();
  return (
    <Ctx.Provider value={act}>
      {children}
      {dialogs}
    </Ctx.Provider>
  );
}

/** Wrap any page that lists files/folders: owns every action dialog once and supplies the dispatcher. */
export function ResourceActionsProvider({
  children,
  currentFolderId,
}: {
  children: React.ReactNode;
  currentFolderId?: string;
}) {
  return (
    <ItemActionsProvider currentFolderId={currentFolderId}>
      <Inner>{children}</Inner>
    </ItemActionsProvider>
  );
}

const RowCtx = createContext<{ ref: ResourceRef; armed: boolean; selected: boolean } | null>(null);

/**
 * A table row with the shared interactions: right-click, Shift+F10 / Menu key and touch long-press open the
 * context menu, and the hover toolbar appears via {@link ResourceActionsCell}. Real permissions are loaded
 * lazily (only when the row is hovered, focused or its menu is opened) for rows that do not carry them.
 */
export function ResourceTr({
  item,
  className,
  children,
  selected = false,
  as: Tag = 'tr',
  ...rest
}: {
  item: ResourceRef;
  className?: string;
  children: React.ReactNode;
  /** Use "li" for list layouts (search results). */
  as?: 'tr' | 'li';
  /** While anything is selected no row shows the hover toolbar: its actions live in the selection bar. */
  selected?: boolean;
} & Omit<React.HTMLAttributes<HTMLElement>, 'children' | 'className'>) {
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);
  const act = useResourceAct();
  const value = useMemo(
    () => ({ ref: item, armed: armed || open, selected }),
    [item, armed, open, selected],
  );
  return (
    <RowCtx.Provider value={value}>
      <ContextMenuRoot
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setArmed(true);
        }}
      >
        <ContextMenuTrigger asChild>
          <Tag
            tabIndex={0}
            data-testid="item-row"
            data-item-id={item.id}
            data-kind={item.kind}
            className={cn(
              'group relative outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)]',
              className,
            )}
            onMouseEnter={() => setArmed(true)}
            onFocus={() => setArmed(true)}
            // A row has its own menu; do not also open the surrounding page's background menu.
            onContextMenu={(e) => e.stopPropagation()}
            {...rest}
          >
            {children}
          </Tag>
        </ContextMenuTrigger>
        {open && <RowContextMenu resource={item} onRun={act} />}
      </ContextMenuRoot>
    </RowCtx.Provider>
  );
}

function menuFor(item: TreeItem, clipboard: ReturnType<typeof useClipboard>) {
  return buildMenu({
    target: 'item',
    items: [item],
    folderPermissions: [],
    currentFolderName: '',
    clipboard,
    sort: 'name',
    view: 'details',
    scope: 'list',
  });
}

function RowContextMenu({
  resource,
  onRun,
}: {
  resource: ResourceRef;
  onRun: (a: ExplorerAction, items: TreeItem[]) => boolean;
}) {
  const clipboard = useClipboard();
  const { item, failed } = useResolvedItem(resource, true);
  const entries = item
    ? menuFor(item, clipboard)
    : [
        {
          id: 'header' as const,
          label: failed ? 'Actions are unavailable for this item.' : 'Loading actions…',
          enabled: false,
        },
      ];
  return <ContextMenuContent entries={entries} onRun={(a) => item && onRun(a, [item])} />;
}

function useRowMenu() {
  const row = useContext(RowCtx);
  const act = useResourceAct();
  const clipboard = useClipboard();
  if (!row) throw new Error('Resource row parts must be inside ResourceTr');
  const { item } = useResolvedItem(row.ref, row.armed);
  const entries = item ? menuFor(item, clipboard) : [];
  const kebab = (label: string) => (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`${label} ${row.ref.name}`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownTrigger>
      <DropdownMenuEntries
        entries={
          entries.length ? entries : [{ id: 'header', label: 'Loading actions…', enabled: false }]
        }
        onRun={(a) => item && act(a, [item])}
      />
    </DropdownRoot>
  );
  return { item, entries, act, kebab };
}

/**
 * Hover toolbar: put it inside the name cell, right after the file name. Same buttons as the folder view.
 */
export function ResourceHover({ compact }: { compact?: boolean } = {}) {
  const { item, entries, act } = useRowMenu();
  const row = useContext(RowCtx);
  if (!item || row?.selected) return null;
  return (
    <HoverToolbar item={item} entries={entries} onRun={(a, t) => act(a, [t])} compact={compact} />
  );
}

/** The always-present "Actions" button (keyboard and touch way to the same menu). Hidden while hovering. */
export function ResourceActionsCell({
  className,
  children,
  as: Tag = 'td',
}: {
  className?: string;
  /** Page-specific controls shown before the Actions button. */
  children?: React.ReactNode;
  as?: 'td' | 'div';
}) {
  const { kebab } = useRowMenu();
  return (
    <Tag className={cn('px-3 py-2 text-right align-middle', className)}>
      <span className="inline-flex items-center gap-1">
        {children}
        {kebab('Actions for')}
      </span>
    </Tag>
  );
}
