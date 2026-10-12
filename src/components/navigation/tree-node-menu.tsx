'use client';

import { useMemo } from 'react';
import { ContextMenuContent } from '@/components/explorer/menu-render';
import { useResourceAct } from '@/components/explorer/resource-actions';
import { useClipboard } from '@/features/explorer/clipboard';
import { buildMenu, type ExplorerAction } from '@/features/explorer/menu';
import type { TreeItem } from '@/lib/api-client';

/**
 * Right-click menu of a folder in the sidebar tree. It is the same menu definition and the same action
 * dispatcher the file list uses, so a folder offers exactly the same actions wherever it is right-clicked.
 */
export function TreeNodeMenu({
  item,
  onNewFolder,
}: {
  item: TreeItem;
  parentId?: string;
  onNewFolder: () => void;
}) {
  const act = useResourceAct();
  const clipboard = useClipboard();
  const entries = useMemo(
    () =>
      buildMenu({
        target: 'item',
        items: [item],
        folderPermissions: [],
        currentFolderName: item.name,
        clipboard,
        sort: 'name',
        view: 'details',
        scope: 'list',
      }),
    [item, clipboard],
  );
  const run = (a: ExplorerAction) => {
    // The tree already owns a "New folder" dialog for its node.
    if (a === 'new-folder') return onNewFolder();
    act(a, [item]);
  };
  return <ContextMenuContent entries={entries} onRun={run} />;
}
