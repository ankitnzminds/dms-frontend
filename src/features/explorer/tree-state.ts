'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Which sidebar tree nodes are expanded. Kept outside React so it survives navigation (the sidebar is
 * remounted between pages) and mirrored to sessionStorage so it survives a reload of the tab. Every node
 * has its own key, so toggling one never affects another.
 */
const STORAGE_KEY = 'dms.tree.open';
let open: Set<string> | null = null;
const listeners = new Set<() => void>();

function load(): Set<string> {
  if (open) return open;
  open = new Set();
  try {
    const raw = typeof window === 'undefined' ? null : window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) for (const k of JSON.parse(raw) as string[]) open.add(k);
  } catch {
    /* storage unavailable: state just lives for this page view */
  }
  return open;
}

function save() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...load()]));
  } catch {
    /* ignore */
  }
}

/** [isOpen, setOpen] for one node. `defaultOpen` applies only until the user has toggled it. */
export function useTreeOpen(key: string, defaultOpen = false): [boolean, (v: boolean) => void] {
  const subscribe = useCallback((cb: () => void) => {
    listeners.add(cb);
    return () => void listeners.delete(cb);
  }, []);
  const snapshot = () => {
    const s = load();
    return s.has(`+${key}`) ? true : s.has(`-${key}`) ? false : defaultOpen;
  };
  // Server render and first client render agree on the default; the stored value applies afterwards.
  const value = useSyncExternalStore(subscribe, snapshot, () => defaultOpen);
  const set = useCallback(
    (v: boolean) => {
      const s = load();
      s.delete(`+${key}`);
      s.delete(`-${key}`);
      s.add(v ? `+${key}` : `-${key}`);
      save();
      for (const l of listeners) l();
    },
    [key],
  );
  return [value, set];
}

/** Standard tree keys for a node's own controls: Right expands, Left collapses. */
export function treeKeyHandler(open: boolean, setOpen: (v: boolean) => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' && !open) {
      e.preventDefault();
      setOpen(true);
    } else if (e.key === 'ArrowLeft' && open) {
      e.preventDefault();
      setOpen(false);
    }
  };
}
