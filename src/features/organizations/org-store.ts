import { useSyncExternalStore } from 'react';

const KEY = 'dms.activeOrganization';
let current: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded) return;
  loaded = true;
  try {
    current = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
  } catch {
    current = null;
  }
}

/** The organization id sent as X-Organization-Id (a UI preference, not a secret). */
export function getActiveOrganizationId(): string | null {
  load();
  return current;
}

export function setActiveOrganizationId(id: string | null) {
  load();
  if (current === id) return;
  current = id;
  try {
    if (id) window.localStorage.setItem(KEY, id);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useActiveOrganizationId(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    getActiveOrganizationId,
    () => null,
  );
}
