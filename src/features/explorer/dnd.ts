import { INTERNAL_DND } from '@/features/upload/read-entries';

export interface DragItem {
  kind: 'folder' | 'document';
  id: string;
  name: string;
}

/** Internal drag payload = stable ids and names only (never content). */
export function writeDragPayload(
  dt: DataTransfer,
  items: DragItem[],
  effect: 'move' | 'copy' | 'copyMove',
) {
  dt.setData(INTERNAL_DND, JSON.stringify(items));
  dt.setData('text/plain', items.map((i) => i.name).join('\n'));
  dt.effectAllowed = effect;
}

export function readDragPayload(dt: DataTransfer): DragItem[] | null {
  const raw = dt.getData(INTERNAL_DND);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return null;
    const ok = v.filter(
      (x): x is DragItem =>
        !!x &&
        typeof x.id === 'string' &&
        typeof x.name === 'string' &&
        (x.kind === 'folder' || x.kind === 'document'),
    );
    return ok.length ? ok.slice(0, 200) : null;
  } catch {
    return null;
  }
}

export const isCopyDrop = (e: { ctrlKey: boolean; metaKey: boolean; altKey?: boolean }) =>
  e.ctrlKey || e.metaKey;
