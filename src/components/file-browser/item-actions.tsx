'use client';

import {
  Copy,
  Download,
  Eye,
  FolderInput,
  FolderOpen,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Share2,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PreviewPanel } from '@/components/file-preview/preview-panel';
import { ManageAccessDialog } from '@/components/sharing/manage-access-dialog';
import { ShareDialog } from '@/components/sharing/share-dialog';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { itemAvailability, type ActionItem, type ItemAction } from '@/features/files/availability';
import { downloadDocument } from '@/features/files/download';
import { useDeleteItem, useToggleStar } from '@/features/files/hooks';
import { friendlyMessage } from '@/lib/api-client';
import { CopyDialog, MoveDialog } from './move-copy-dialog';
import { RenameDialog } from './name-dialogs';

interface Ctx {
  run: (action: ItemAction, item: ActionItem) => void;
}
const ActionsCtx = createContext<Ctx | null>(null);

export function useItemActions() {
  const c = useContext(ActionsCtx);
  if (!c) throw new Error('useItemActions must be used inside ItemActionsProvider');
  return c;
}

type DialogKind = 'preview' | 'rename' | 'move' | 'copy' | 'share' | 'access' | 'delete';

/** Owns the dialogs for row actions so list pages stay thin. */
export function ItemActionsProvider({ children, onOpenFolder }: { children: React.ReactNode; onOpenFolder?: (id: string) => void }) {
  const router = useRouter();
  const [dlg, setDlg] = useState<{ kind: DialogKind; item: ActionItem } | null>(null);
  const del = useDeleteItem();
  const star = useToggleStar();

  const run = useCallback(
    (action: ItemAction, item: ActionItem) => {
      switch (action) {
        case 'open':
          if (item.kind === 'folder') {
            if (onOpenFolder) onOpenFolder(item.id);
            else router.push(`/files/${item.id}`);
          } else router.push(`/documents/${item.id}`);
          return;
        case 'download':
          downloadDocument(item.id).catch((e) => toast.error(friendlyMessage(e)));
          return;
        case 'star':
          star.mutate(
            { id: item.id, starred: !item.starred },
            {
              onSuccess: () => toast.success(item.starred ? `Removed "${item.name}" from starred` : `Starred "${item.name}"`),
              onError: (e) => toast.error(friendlyMessage(e)),
            },
          );
          return;
        default:
          setDlg({ kind: action as DialogKind, item });
      }
    },
    [router, star, onOpenFolder],
  );

  const value = useMemo(() => ({ run }), [run]);
  const close = (o: boolean) => !o && setDlg(null);
  const it = dlg?.item;

  return (
    <ActionsCtx.Provider value={value}>
      {children}
      {it && dlg.kind === 'rename' && (
        <RenameDialog open kind={it.kind} id={it.id} currentName={it.name} onOpenChange={close} />
      )}
      {it && dlg.kind === 'move' && <MoveDialog open kind={it.kind} id={it.id} name={it.name} onOpenChange={close} />}
      {it && dlg.kind === 'copy' && <CopyDialog open id={it.id} name={it.name} onOpenChange={close} />}
      {it && dlg.kind === 'share' && (
        <ShareDialog open kind={it.kind} id={it.id} name={it.name} permissions={it.permissions} onOpenChange={close} />
      )}
      {it && dlg.kind === 'access' && (
        <ManageAccessDialog open kind={it.kind} id={it.id} name={it.name} permissions={it.permissions} onOpenChange={close} />
      )}
      {it && dlg.kind === 'preview' && (
        <Dialog open onOpenChange={close}>
          <DialogContent title={it.name} className="max-w-4xl">
            <DialogBody>
              <PreviewPanel
                documentId={it.id}
                contentType={it.content_type ?? 'application/octet-stream'}
                name={it.name}
                canDownload={itemAvailability(it).download.enabled}
              />
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}
      <ConfirmDialog
        open={!!it && dlg.kind === 'delete'}
        onOpenChange={close}
        title={`Move "${it?.name}" to trash?`}
        description={
          it?.kind === 'folder'
            ? 'The folder and everything inside it will be moved to the trash. You can restore it from Trash.'
            : 'The file will be moved to the trash. You can restore it from Trash.'
        }
        confirmLabel="Move to trash"
        destructive
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(
            { kind: it!.kind, id: it!.id },
            {
              onSuccess: () => {
                toast.success(`Moved "${it!.name}" to trash`);
                setDlg(null);
              },
              onError: (e) => toast.error(friendlyMessage(e)),
            },
          )
        }
      />
    </ActionsCtx.Provider>
  );
}

const MENU: { action: ItemAction; label: (i: ActionItem) => string; icon: React.ComponentType; group: number; destructive?: boolean }[] = [
  { action: 'open', label: (i) => (i.kind === 'folder' ? 'Open folder' : 'Open details'), icon: FolderOpen, group: 0 },
  { action: 'preview', label: () => 'Preview', icon: Eye, group: 0 },
  { action: 'download', label: () => 'Download', icon: Download, group: 0 },
  { action: 'share', label: () => 'Share…', icon: Share2, group: 1 },
  { action: 'access', label: () => 'Manage access…', icon: KeyRound, group: 1 },
  { action: 'star', label: (i) => (i.starred ? 'Remove star' : 'Add star'), icon: Star, group: 1 },
  { action: 'rename', label: () => 'Rename…', icon: Pencil, group: 2 },
  { action: 'move', label: () => 'Move…', icon: FolderInput, group: 2 },
  { action: 'copy', label: () => 'Copy…', icon: Copy, group: 2 },
  { action: 'delete', label: () => 'Move to trash…', icon: Trash2, group: 3, destructive: true },
];

/** Row actions menu. Every entry is enabled/disabled strictly from the item's `permissions`. */
export function ItemMenu({ item, hide = [] }: { item: ActionItem; hide?: ItemAction[] }) {
  const { run } = useItemActions();
  const av = itemAvailability(item);
  const entries = MENU.filter((m) => !hide.includes(m.action));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${item.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {entries.map((m, i) => {
          const a = av[m.action];
          const Icon = m.action === 'star' && item.starred ? StarOff : m.icon;
          return (
            <span key={m.action}>
              {i > 0 && entries[i - 1]!.group !== m.group && <DropdownMenuSeparator />}
              <DropdownMenuItem
                disabled={!a.enabled}
                reason={a.reason}
                destructive={m.destructive}
                onSelect={() => run(m.action, item)}
              >
                <Icon />
                <span className="flex-1">{m.label(item)}</span>
              </DropdownMenuItem>
            </span>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
