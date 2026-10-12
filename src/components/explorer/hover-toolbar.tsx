'use client';

import {
  Copy,
  Download,
  FolderInput,
  KeyRound,
  Lock,
  LockOpen,
  Pencil,
  Share2,
  Star,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ExplorerAction, MenuEntry } from '@/features/explorer/menu';
import type { TreeItem } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const ITEMS: { id: ExplorerAction; label: string; icon: React.ComponentType; danger?: boolean }[] =
  [
    { id: 'share', label: 'Share', icon: Share2 },
    { id: 'download', label: 'Download', icon: Download },
    { id: 'rename', label: 'Rename', icon: Pencil },
    { id: 'copy-to', label: 'Copy', icon: Copy },
    { id: 'move-to', label: 'Move', icon: FolderInput },
    { id: 'delete', label: 'Delete', icon: Trash2, danger: true },
    { id: 'access', label: 'Permissions', icon: KeyRound },
  ];

/**
 * Compact action toolbar shown on row hover or keyboard focus, inline right after the item name (never at the
 * far end of the row, and never on a selected row). Every button runs the same action as the context menu.
 * Disabled buttons keep their place and explain why in the tooltip; the server authorizes each action anyway.
 */
export function HoverToolbar({
  item,
  entries,
  onRun,
  overflow,
  forceVisible,
  compact,
  className,
}: {
  item: TreeItem;
  entries: MenuEntry[];
  onRun: (a: ExplorerAction, item: TreeItem) => void;
  overflow?: React.ReactNode;
  forceVisible?: boolean;
  /** Only the everyday actions; Copy, Move and Permissions stay in the three-dot menu. */
  compact?: boolean;
  className?: string;
}) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const visible = ITEMS.filter(
    ({ id }) => !compact || !['copy-to', 'move-to', 'access'].includes(id),
  );
  return (
    // Clicks are only stopped from reaching the row (so using a button never changes the selection);
    // keyboard use goes through the buttons themselves.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      role="toolbar"
      aria-label={`Actions for ${item.name}`}
      className={cn(
        'z-[1] ml-1 shrink-0 items-center gap-0.5 rounded-md bg-surface/95 px-1 shadow-sm ring-1 ring-line',
        // Only when the name cell is wide enough to hold it beside the name (container query); otherwise the
        // row's "Actions" button stays and the toolbar never overlaps or wraps.
        forceVisible
          ? 'hidden @[26rem]:flex'
          : 'hidden @[26rem]:group-focus-within:flex @[26rem]:group-hover:flex',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {/* Star: reuses the Quick Access favorite/unfavorite menu entries (same API, same permissions). */}
      {(() => {
        const starred = !!item.starred;
        const entry = byId.get(starred ? 'unfavorite' : 'favorite');
        if (!entry) return null;
        const label = starred ? 'Remove from Starred' : 'Add to Starred';
        return (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`${label}: ${item.name}`}
            aria-pressed={starred}
            title={entry.enabled ? label : `${label}: ${entry.reason ?? 'not available'}`}
            disabled={!entry.enabled}
            onClick={(e) => {
              e.stopPropagation();
              onRun(starred ? 'unfavorite' : 'favorite', item);
            }}
            data-testid="hover-star"
          >
            <Star className={starred ? 'fill-warn text-warn' : undefined} />
          </Button>
        );
      })()}
      {/* Lock / Unlock: the same menu entries (permissions, break-lock rules) as the right-click menu. */}
      {(() => {
        const entry = byId.get(item.locked ? 'unlock' : 'lock');
        if (!entry) return null;
        const label = item.locked ? 'Unlock' : 'Lock';
        const Icon = item.locked ? LockOpen : Lock;
        return (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`${label} ${item.name}`}
            title={entry.enabled ? label : `${label}: ${entry.reason ?? 'not available'}`}
            disabled={!entry.enabled}
            onClick={(e) => {
              e.stopPropagation();
              onRun(item.locked ? 'unlock' : 'lock', item);
            }}
            data-testid="hover-lock"
          >
            <Icon className={item.locked ? 'text-warn' : undefined} />
          </Button>
        );
      })()}
      {visible.map(({ id, label, icon: Icon, danger }) => {
        const entry = byId.get(id);
        const enabled = !!entry?.enabled;
        return (
          <Button
            key={id}
            size="icon-sm"
            variant={danger ? 'danger-ghost' : 'ghost'}
            aria-label={`${label} ${item.name}`}
            title={enabled ? label : `${label}: ${entry?.reason ?? 'not available'}`}
            disabled={!enabled}
            onClick={(e) => {
              e.stopPropagation();
              onRun(id, item);
            }}
            data-testid={`hover-${id}`}
          >
            <Icon />
          </Button>
        );
      })}
      {overflow}
    </div>
  );
}
