/**
 * Session storage for the Supabase client that honors "Remember me".
 * Remembered sessions live in localStorage (survive a browser restart); others in sessionStorage (end with the
 * browser tab / window). Reads look in both places so a reload finds the session wherever it was stored.
 */
const FLAG = 'dms.auth.remember';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

const local = (): Store | null => (typeof window === 'undefined' ? null : window.localStorage);
const session = (): Store | null => (typeof window === 'undefined' ? null : window.sessionStorage);

/** Call right before signing in. */
export function setRememberPreference(remember: boolean) {
  safe(() => local()?.setItem(FLAG, remember ? '1' : '0'), undefined);
}

const remembered = () => safe(() => local()?.getItem(FLAG) !== '0', true);

export const rememberStorage = {
  getItem(key: string): string | null {
    return safe(() => session()?.getItem(key) ?? local()?.getItem(key) ?? null, null);
  },
  setItem(key: string, value: string): void {
    safe(() => {
      const target = remembered() ? local() : session();
      const other = remembered() ? session() : local();
      target?.setItem(key, value);
      other?.removeItem(key);
    }, undefined);
  },
  removeItem(key: string): void {
    safe(() => {
      local()?.removeItem(key);
      session()?.removeItem(key);
    }, undefined);
  },
};
