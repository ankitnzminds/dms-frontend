'use client';

import { Check } from 'lucide-react';
import { ContextMenu as C, DropdownMenu as D } from 'radix-ui';
import type { ExplorerAction, MenuEntry } from '@/features/explorer/menu';
import { cn } from '@/lib/utils';

const contentCls =
  'animate-pop z-[65] min-w-52 max-w-[calc(100vw-1rem)] rounded-lg border border-line bg-surface p-1 shadow-pop';
const itemCls =
  'relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2';

type Kit = typeof C | typeof D;

function Entries({
  kit,
  entries,
  onRun,
}: {
  kit: Kit;
  entries: MenuEntry[];
  onRun: (a: ExplorerAction) => void;
}) {
  const K = kit as typeof C;
  return (
    <>
      {entries.map((e, i) => (
        <span key={`${e.id}-${i}`} className="contents">
          {e.separatorBefore && i > 0 && <K.Separator className="-mx-1 my-1 h-px bg-line" />}
          {e.id === 'header' ? (
            <K.Label className="px-2 py-1.5 text-xs font-medium text-muted">{e.label}</K.Label>
          ) : e.submenu ? (
            <K.Sub>
              <K.SubTrigger className={cn(itemCls, 'data-[state=open]:bg-surface-2')}>
                <span className="flex-1">{e.label}</span>
                <span aria-hidden>›</span>
              </K.SubTrigger>
              <K.Portal>
                <K.SubContent className={contentCls} sideOffset={4}>
                  <Entries kit={kit} entries={e.submenu} onRun={onRun} />
                </K.SubContent>
              </K.Portal>
            </K.Sub>
          ) : (
            <K.Item
              disabled={!e.enabled}
              title={!e.enabled ? e.reason : undefined}
              aria-describedby={undefined}
              className={cn(itemCls, e.danger && 'text-danger data-[highlighted]:bg-danger-soft')}
              onSelect={() => onRun(e.id as ExplorerAction)}
              data-testid={`menu-${e.id}`}
            >
              <span className="flex size-4 items-center justify-center">
                {e.checked && <Check className="size-3.5" aria-hidden />}
              </span>
              <span className="flex-1">{e.label}</span>
              {!e.enabled && e.reason && <span className="sr-only">({e.reason})</span>}
              {e.shortcut && <kbd className="ml-4 text-xs text-faint">{e.shortcut}</kbd>}
            </K.Item>
          )}
        </span>
      ))}
    </>
  );
}

export function ContextMenuContent({
  entries,
  onRun,
}: {
  entries: MenuEntry[];
  onRun: (a: ExplorerAction) => void;
}) {
  return (
    <C.Portal>
      <C.Content className={contentCls} collisionPadding={8} data-testid="context-menu">
        <Entries kit={C} entries={entries} onRun={onRun} />
      </C.Content>
    </C.Portal>
  );
}

export function DropdownMenuEntries({
  entries,
  onRun,
}: {
  entries: MenuEntry[];
  onRun: (a: ExplorerAction) => void;
}) {
  return (
    <D.Portal>
      <D.Content className={contentCls} align="end" sideOffset={4} collisionPadding={8}>
        <Entries kit={D} entries={entries} onRun={onRun} />
      </D.Content>
    </D.Portal>
  );
}

export const ContextMenuRoot = C.Root;
export const ContextMenuTrigger = C.Trigger;
export const DropdownRoot = D.Root;
export const DropdownTrigger = D.Trigger;
