import { useSyncExternalStore } from 'react';
import type { ItemRef } from './hooks';

export interface ClipboardEntry extends ItemRef {
  name: string;
}
export interface ClipboardState {
  op: 'cut' | 'copy';
  items: ClipboardEntry[];
  sourceFolderId: string | null;
}

/**
 * In-app clipboard: stable item ids only (never bytes or secrets), kept in memory (not localStorage) and
 * cleared on sign-out. Cut is a MOVE on paste; copy creates new items on paste.
 */
let state: ClipboardState | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getClipboard = () => state;
export function setClipboard(next: ClipboardState | null) {
  state = next;
  emit();
}
export const clearClipboard = () => setClipboard(null);

export function useClipboard(): ClipboardState | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => state,
    () => null,
  );
}

/** Drop ids that were just moved/handled so a cut cannot be pasted twice. */
export function removeFromClipboard(ids: string[]) {
  if (!state) return;
  const left = state.items.filter((i) => !ids.includes(i.id));
  setClipboard(left.length ? { ...state, items: left } : null);
}
