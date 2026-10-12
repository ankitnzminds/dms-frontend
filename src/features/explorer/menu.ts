import { itemAvailability, type ActionItem, type ItemAction } from '@/features/files/availability';
import type { SortKey } from '@/features/files/hooks';
import type { TreeItem } from '@/lib/api-client';
import { can } from '@/lib/permissions';
import { COLOR_TAGS } from '@/features/files/hooks';
import { previewKind } from '@/features/preview/kinds';
import type { ClipboardState } from './clipboard';
import type { ViewMode } from './prefs';

export type ExplorerAction =
  | 'open'
  | 'open-tab'
  | 'preview'
  | 'download'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'rename'
  | 'share'
  | 'access'
  | 'copy-link'
  | 'move-to'
  | 'copy-to'
  | 'duplicate'
  | 'properties'
  | 'versions'
  | 'lock'
  | 'unlock'
  | 'favorite'
  | 'unfavorite'
  | 'delete'
  | 'new-folder'
  | 'create-file'
  | 'upload-files'
  | 'upload-folder'
  | 'refresh'
  | 'select-all'
  | 'clear-selection'
  | 'request-access'
  | 'export-pdf'
  | 'create-workflow'
  | `color:${string}`
  | `sort:${SortKey}`
  | `view:${ViewMode}`;

export interface MenuEntry {
  id: ExplorerAction | 'sort' | 'view' | 'header' | 'color-tag';
  label: string;
  shortcut?: string;
  enabled: boolean;
  /** Shown as a tooltip/description when disabled. */
  reason?: string;
  danger?: boolean;
  checked?: boolean;
  separatorBefore?: boolean;
  submenu?: MenuEntry[];
}

export interface MenuContext {
  target: 'item' | 'selection' | 'background';
  items: TreeItem[];
  folderPermissions: readonly string[];
  currentFolderName: string;
  clipboard: ClipboardState | null;
  sort: SortKey;
  view: ViewMode;
  /** "list": rows outside a folder view (Recent, Team Folders, shares): no entries that need a folder context. */
  scope?: 'folder' | 'list';
  /** The caller's own user id is not needed: `locked_by_me` comes from the API. */
}

const asAction = (t: TreeItem): ActionItem => ({
  kind: t.kind,
  id: t.id,
  name: t.name,
  permissions: t.permissions,
  starred: t.starred,
  status: t.status,
  content_type: t.content_type,
});

const E = (id: MenuEntry['id'], label: string, extra: Partial<MenuEntry> = {}): MenuEntry => ({
  id,
  label,
  enabled: true,
  ...extra,
});
const gate = (a: { enabled: boolean; reason?: string }): Pick<MenuEntry, 'enabled' | 'reason'> => ({
  enabled: a.enabled,
  reason: a.enabled ? undefined : a.reason,
});

/** Who may lock: the right to change the item (documents: new versions; folders: rename). */
export const canLock = (t: TreeItem) =>
  !t.locked && can(t.permissions, t.kind === 'document' ? 'upload_version' : 'rename');
/** Who may unlock: the holder, or an administrator (breaking the lock). */
export const canUnlock = (t: TreeItem) =>
  t.locked && (t.locked_by_me || can(t.permissions, 'administer'));

function lockEntry(t: TreeItem): MenuEntry {
  if (t.locked)
    return t.locked_by_me
      ? E('unlock', 'Unlock (check in)')
      : E('unlock', 'Unlock (break lock)', {
          ...gate({
            enabled: canUnlock(t),
            reason: `Locked by someone else. Only an administrator can break the lock.`,
          }),
        });
  return E('lock', 'Lock (check out)', {
    ...gate({
      enabled: canLock(t),
      reason: `You cannot lock this ${t.kind === 'document' ? 'document' : 'folder'}.`,
    }),
  });
}

/** "Create Workflow…": building a workflow is an administrator task (the server enforces it too). */
function workflowEntry(t: TreeItem): MenuEntry {
  const allowed = can(t.permissions, 'administer');
  return E('create-workflow', 'Create Workflow…', {
    ...gate({ enabled: allowed, reason: 'Creating workflows needs administrator access.' }),
  });
}

/** "Apply color tag" submenu (needs the right to edit the item's details; folders: rename). */
function colorEntry(t: TreeItem): MenuEntry {
  const allowed =
    t.kind === 'document' ? can(t.permissions, 'edit_metadata') : can(t.permissions, 'rename');
  return E('color-tag', 'Apply color tag', {
    ...gate({ enabled: allowed, reason: 'You cannot edit this item.' }),
    separatorBefore: true,
    submenu: [
      ...COLOR_TAGS.map((c) =>
        E(`color:${c}` as ExplorerAction, c[0]!.toUpperCase() + c.slice(1), {
          checked: t.color_tag === c,
        }),
      ),
      E('color:none' as ExplorerAction, 'Remove tag', {
        enabled: !!t.color_tag,
        separatorBefore: true,
      }),
    ],
  });
}

const SORT_LABELS: [SortKey, string][] = [
  ['name', 'Name'],
  ['type', 'Type'],
  ['updated_at', 'Modified'],
  ['modified_by', 'Modified by'],
  ['size', 'Size'],
];
const VIEW_LABELS: [ViewMode, string][] = [
  ['details', 'Details'],
  ['compact', 'Compact list'],
  ['tiles', 'Tiles'],
  ['grid', 'Large icons'],
];

function pasteEntry(ctx: MenuContext, targetCanCreate: boolean, label = 'Paste'): MenuEntry {
  const cb = ctx.clipboard;
  if (!cb)
    return E('paste', label, {
      shortcut: 'Ctrl+V',
      enabled: false,
      reason: 'The clipboard is empty.',
    });
  if (!targetCanCreate)
    return E('paste', label, {
      shortcut: 'Ctrl+V',
      enabled: false,
      reason: 'You cannot add items to this folder.',
    });
  return E(
    'paste',
    `${label} ${cb.items.length} item${cb.items.length === 1 ? '' : 's'} (${cb.op === 'cut' ? 'move' : 'copy'})`,
    {
      shortcut: 'Ctrl+V',
    },
  );
}

/** The single source of truth for what each context menu offers (and why something is disabled). */
export function buildMenu(ctx: MenuContext): MenuEntry[] {
  const all = buildFolderMenu(ctx);
  if (ctx.scope !== 'list') return all;
  const doc = ctx.items[0]?.kind === 'document';
  return all.filter((e) => e.id !== 'duplicate' && !(doc && e.id === 'paste'));
}

function buildFolderMenu(ctx: MenuContext): MenuEntry[] {
  const canFolderHere = can(ctx.folderPermissions, 'create_folder');
  const canFileHere = can(ctx.folderPermissions, 'create_file');
  const canUploadHere = can(ctx.folderPermissions, 'upload');
  const canCreateHere = canFolderHere || canFileHere || canUploadHere;
  const noRight = 'You do not have permission to do this in this folder.';

  if (ctx.target === 'background') {
    return [
      E('new-folder', 'New folder', {
        shortcut: 'Ctrl+Shift+N',
        enabled: canFolderHere,
        reason: canFolderHere ? undefined : noRight,
      }),
      E('create-file', 'Create file…', {
        enabled: canFileHere,
        reason: canFileHere ? undefined : noRight,
      }),
      E('upload-files', 'Upload files…', {
        enabled: canUploadHere,
        reason: canUploadHere ? undefined : noRight,
      }),
      E('upload-folder', 'Upload folder…', {
        enabled: canUploadHere && canFolderHere,
        reason: canUploadHere && canFolderHere ? undefined : noRight,
      }),
      { ...pasteEntry(ctx, canUploadHere || canFolderHere), separatorBefore: true },
      E('sort', 'Sort by', {
        separatorBefore: true,
        enabled: true,
        submenu: SORT_LABELS.map(([k, l]) =>
          E(`sort:${k}` as ExplorerAction, l, { checked: ctx.sort === k }),
        ),
      }),
      E('view', 'View', {
        enabled: true,
        submenu: VIEW_LABELS.map(([k, l]) =>
          E(`view:${k}` as ExplorerAction, l, { checked: ctx.view === k }),
        ),
      }),
      E('refresh', 'Refresh', { shortcut: 'F5', separatorBefore: true }),
      E('select-all', 'Select all', { shortcut: 'Ctrl+A' }),
      E('properties', `Properties of "${ctx.currentFolderName}"`, {
        shortcut: 'Alt+Enter',
        separatorBefore: true,
      }),
    ];
  }

  if (ctx.target === 'selection') {
    const its = ctx.items.map(asAction);
    const all = (a: ItemAction) => its.every((i) => itemAvailability(i)[a].enabled);
    const firstBlock = (a: ItemAction) =>
      its.map((i) => itemAvailability(i)[a]).find((x) => !x.enabled)?.reason;
    const allDocs = its.every((i) => i.kind === 'document');
    return [
      E('header', `${its.length} items selected`, { enabled: false }),
      E('copy', 'Copy', {
        shortcut: 'Ctrl+C',
        enabled:
          all('copy') || its.every((i) => i.kind === 'folder' || itemAvailability(i).copy.enabled),
        reason: firstBlock('copy'),
      }),
      E('cut', 'Cut', {
        shortcut: 'Ctrl+X',
        ...gate({ enabled: all('move'), reason: firstBlock('move') }),
      }),
      E('move-to', 'Move to…', gate({ enabled: all('move'), reason: firstBlock('move') })),
      E('copy-to', 'Copy to…', gate({ enabled: all('copy'), reason: firstBlock('copy') })),
      E('lock', 'Lock', {
        separatorBefore: true,
        ...gate({
          enabled: ctx.items.some(canLock),
          reason: 'Nothing selected can be locked (already locked, or you cannot change it).',
        }),
      }),
      E('unlock', 'Unlock', {
        ...gate({
          enabled: ctx.items.some(canUnlock),
          reason: 'Nothing selected is locked by you (administrators can unlock any).',
        }),
      }),
      E('download', 'Download', {
        enabled: false,
        reason: allDocs
          ? 'Download one file at a time. ZIP download is not available.'
          : 'Folders cannot be downloaded.',
        separatorBefore: true,
      }),
      E('delete', 'Move to Trash', {
        shortcut: 'Del',
        danger: true,
        separatorBefore: true,
        ...gate({ enabled: all('delete'), reason: firstBlock('delete') }),
      }),
      E('clear-selection', 'Clear selection', { shortcut: 'Esc', separatorBefore: true }),
    ];
  }

  // single item
  const t = ctx.items[0]!;
  const a = asAction(t);
  const av = itemAvailability(a);
  const isDoc = t.kind === 'document';
  const lackAccess = !can(t.permissions, 'view') || (isDoc && !can(t.permissions, 'download'));
  const fav = !!t.starred;

  if (isDoc) {
    return [
      E('open', 'Open', { shortcut: 'Enter', ...gate(av.open) }),
      E('preview', 'Preview', gate(av.preview)),
      E('open-tab', 'Open in new tab', gate(av.open)),
      E('download', 'Download', gate(av.download)),
      E('cut', 'Cut', { shortcut: 'Ctrl+X', separatorBefore: true, ...gate(av.move) }),
      E('copy', 'Copy', { shortcut: 'Ctrl+C', ...gate(av.copy) }),
      pasteEntry(ctx, canUploadHere || canFolderHere, 'Paste here'),
      E('rename', 'Rename', { shortcut: 'F2', separatorBefore: true, ...gate(av.rename) }),
      E('share', 'Share…', gate(av.share)),
      E('access', 'Manage access…', gate(av.access)),
      workflowEntry(t),
      E('copy-link', 'Copy link'),
      E('move-to', 'Move to…', { separatorBefore: true, ...gate(av.move) }),
      E('copy-to', 'Copy to…', gate(av.copy)),
      E(
        'duplicate',
        'Make a copy',
        gate({
          enabled: av.copy.enabled && canCreateHere,
          reason: av.copy.reason ?? 'You cannot add items to this folder.',
        }),
      ),
      E('properties', 'Properties', { shortcut: 'Alt+Enter', separatorBefore: true }),
      E('versions', 'Version history & compare'),
      ...(previewKind(t.content_type ?? '', t.name) === 'office'
        ? [
            E('export-pdf', 'Download as PDF', {
              ...gate({
                enabled: can(t.permissions, 'download'),
                reason: 'You do not have permission to download this file.',
              }),
            }),
          ]
        : []),
      colorEntry(t),
      lockEntry(t),
      E(fav ? 'unfavorite' : 'favorite', fav ? 'Remove from Quick Access' : 'Add to Quick Access', {
        separatorBefore: true,
      }),
      ...(lackAccess ? [E('request-access', 'Request access…')] : []),
      E('delete', 'Move to Trash', {
        shortcut: 'Del',
        danger: true,
        separatorBefore: true,
        ...gate(av.delete),
      }),
    ];
  }

  return [
    E('open', 'Open', { shortcut: 'Enter', ...gate(av.open) }),
    E('open-tab', 'Open in new tab', gate(av.open)),
    E('download', 'Download as ZIP', gate(av.download)),
    E('new-folder', 'New folder inside', {
      separatorBefore: true,
      enabled: can(t.permissions, 'create_folder'),
      reason: can(t.permissions, 'create_folder')
        ? undefined
        : 'You do not have permission to do this in this folder.',
    }),
    E('create-file', 'Create file here…', {
      enabled: can(t.permissions, 'create_file'),
      reason: can(t.permissions, 'create_file')
        ? undefined
        : 'You do not have permission to do this in this folder.',
    }),
    E('upload-files', 'Upload files here…', {
      enabled: can(t.permissions, 'upload'),
      reason: can(t.permissions, 'upload')
        ? undefined
        : 'You do not have permission to do this in this folder.',
    }),
    E('upload-folder', 'Upload folder here…', {
      enabled: can(t.permissions, 'upload'),
      reason: can(t.permissions, 'upload')
        ? undefined
        : 'You do not have permission to do this in this folder.',
    }),
    E('cut', 'Cut', { shortcut: 'Ctrl+X', separatorBefore: true, ...gate(av.move) }),
    E('copy', 'Copy', { shortcut: 'Ctrl+C', enabled: true }),
    pasteEntry(
      ctx,
      can(t.permissions, 'upload') || can(t.permissions, 'create_folder'),
      'Paste into',
    ),
    E('rename', 'Rename', { shortcut: 'F2', separatorBefore: true, ...gate(av.rename) }),
    E('share', 'Share…', gate(av.share)),
    E('access', 'Manage access…', gate(av.access)),
    workflowEntry(t),
    E('copy-link', 'Copy link'),
    E('move-to', 'Move to…', { separatorBefore: true, ...gate(av.move) }),
    E('copy-to', 'Copy to…', { enabled: true }),
    E('properties', 'Properties', { shortcut: 'Alt+Enter', separatorBefore: true }),
    colorEntry(t),
    lockEntry(t),
    E(fav ? 'unfavorite' : 'favorite', fav ? 'Remove from Quick Access' : 'Add to Quick Access'),
    ...(lackAccess ? [E('request-access', 'Request access…')] : []),
    E('delete', 'Move to Trash', {
      shortcut: 'Del',
      danger: true,
      separatorBefore: true,
      ...gate(av.delete),
    }),
  ];
}
