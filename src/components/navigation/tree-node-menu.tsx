'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { ContextMenuContent } from '@/components/explorer/menu-render';
import { useExplorerOps } from '@/components/explorer/ops';
import { useItemActions } from '@/components/file-browser/item-actions';
import { useUploadPickers } from '@/components/upload/pickers';
import { setClipboard, useClipboard } from '@/features/explorer/clipboard';
import { buildMenu, type ExplorerAction, type MenuEntry } from '@/features/explorer/menu';
import { toActionItem } from '@/components/file-browser/items-table';
import { useToggleStar } from '@/features/files/hooks';
import { friendlyMessage, type TreeItem } from '@/lib/api-client';

/** Folder actions that make sense from the sidebar tree (no selection/sort/view state needed). */
const SUPPORTED: ReadonlySet<string> = new Set<ExplorerAction>([
  'open',
  'open-tab',
  'new-folder',
  'upload-files',
  'upload-folder',
  'cut',
  'copy',
  'paste',
  'rename',
  'share',
  'access',
  'copy-link',
  'favorite',
  'unfavorite',
  'properties',
  'delete',
]);

/** The shared Explorer menu definition, narrowed to what the tree can really do. */
function treeEntries(entries: MenuEntry[]): MenuEntry[] {
  const kept = entries.filter((e) => SUPPORTED.has(e.id));
  if (kept[0]) kept[0] = { ...kept[0], separatorBefore: false };
  return kept;
}

export function TreeNodeMenu({
  item,
  parentId,
  onNewFolder,
}: {
  item: TreeItem;
  parentId: string;
  onNewFolder: () => void;
}) {
  const router = useRouter();
  const ops = useExplorerOps();
  const pickers = useUploadPickers();
  const { run } = useItemActions();
  const star = useToggleStar();
  const clipboard = useClipboard();

  const entries = useMemo(
    () =>
      treeEntries(
        buildMenu({
          target: 'item',
          items: [item],
          folderPermissions: item.permissions,
          currentFolderName: item.name,
          clipboard,
          sort: 'name',
          view: 'details',
        }),
      ),
    [item, clipboard],
  );

  const act = (a: ExplorerAction) => {
    const named = [{ kind: item.kind, id: item.id, name: item.name }];
    switch (a) {
      case 'open':
        return router.push(`/files/${item.id}`);
      case 'open-tab':
        return void window.open(`/files/${item.id}`, '_blank', 'noopener,noreferrer');
      case 'properties':
        return router.push(`/files/${item.id}?details=properties`);
      case 'new-folder':
        return onNewFolder();
      case 'upload-files':
        return pickers.pickFiles(item.id);
      case 'upload-folder':
        return pickers.pickFolder(item.id);
      case 'cut':
      case 'copy':
        setClipboard({ op: a, items: named, sourceFolderId: parentId });
        return void toast.message(
          `"${item.name}" ${a === 'cut' ? 'cut' : 'copied'}. Paste into a folder to ${a === 'cut' ? 'move' : 'copy'} it.`,
        );
      case 'paste':
        return void ops.paste({ id: item.id, name: item.name });
      case 'rename':
      case 'share':
      case 'access':
        return run(a, toActionItem(item));
      case 'copy-link':
        return void navigator.clipboard
          ?.writeText(`${window.location.origin}/files/${item.id}`)
          .then(() => toast.success('Link copied. It only works for people who have access.'))
          .catch(() => toast.error('Could not copy the link.'));
      case 'favorite':
      case 'unfavorite':
        return star.mutate(
          { id: item.id, starred: a === 'favorite', kind: item.kind },
          {
            onSuccess: () =>
              toast.success(
                a === 'favorite'
                  ? `Added "${item.name}" to Quick Access`
                  : `Removed "${item.name}" from Quick Access`,
              ),
            onError: (e) => toast.error(friendlyMessage(e)),
          },
        );
      case 'delete':
        return ops.trash(named);
    }
  };

  return <ContextMenuContent entries={entries} onRun={act} />;
}
