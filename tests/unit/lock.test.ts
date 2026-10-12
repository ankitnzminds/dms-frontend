import { describe, expect, it } from 'vitest';
import { validateLockEnd } from '@/components/file-browser/lock-dialog';
import { buildMenu, canLock, canUnlock } from '@/features/explorer/menu';
import type { TreeItem } from '@/lib/api-client';

const item = (over: Partial<TreeItem>): TreeItem =>
  ({
    id: 'i1',
    kind: 'document',
    name: 'plan.pdf',
    updated_at: new Date().toISOString(),
    permissions: ['view', 'upload_version', 'rename'],
    starred: false,
    locked: false,
    locked_by_me: false,
    is_team_folder: false,
    ...over,
  }) as TreeItem;

const entries = (t: TreeItem) =>
  buildMenu({
    target: 'item',
    items: [t],
    folderPermissions: [],
    currentFolderName: '',
    clipboard: null,
    sort: 'name',
    view: 'details',
    scope: 'list',
  });
const find = (t: TreeItem, id: string) => entries(t).find((e) => e.id === id);

describe('lock end time validation', () => {
  const now = Date.parse('2026-10-10T10:00:00Z');
  it('rejects empty, invalid, past and too-far times', () => {
    expect(validateLockEnd('', now)).toMatch(/Choose/);
    expect(validateLockEnd('not a date', now)).toMatch(/valid/);
    expect(validateLockEnd('2026-10-10T09:00:00Z', now)).toMatch(/future/);
    expect(validateLockEnd('2026-10-10T10:00:30Z', now)).toMatch(/future/);
    expect(validateLockEnd('2028-01-01T00:00:00Z', now)).toMatch(/at most/);
  });
  it('accepts a time inside the allowed window', () => {
    expect(validateLockEnd('2026-10-12T10:00:00Z', now)).toBeNull();
  });
});

describe('who can lock and unlock', () => {
  it('locking needs the right to change the item; an already locked item cannot be locked again', () => {
    expect(canLock(item({}))).toBe(true);
    expect(canLock(item({ permissions: ['view'] }))).toBe(false);
    expect(canLock(item({ locked: true, locked_by_me: true }))).toBe(false);
    // folders use the rename right
    expect(canLock(item({ kind: 'folder', permissions: ['view', 'rename'] }))).toBe(true);
    expect(canLock(item({ kind: 'folder', permissions: ['view'] }))).toBe(false);
  });
  it('the holder can unlock; others only if administrator', () => {
    expect(canUnlock(item({ locked: true, locked_by_me: true }))).toBe(true);
    expect(canUnlock(item({ locked: true, locked_by_me: false }))).toBe(false);
    expect(
      canUnlock(item({ locked: true, locked_by_me: false, permissions: ['view', 'administer'] })),
    ).toBe(true);
    expect(canUnlock(item({ locked: false }))).toBe(false);
  });
});

describe('menu entries (same for files and folders)', () => {
  for (const kind of ['document', 'folder'] as const) {
    it(`${kind}: unlocked shows Lock, locked shows Unlock`, () => {
      const lock = find(item({ kind }), 'lock');
      expect(lock?.label).toMatch(/^Lock/);
      expect(lock?.enabled).toBe(true);
      expect(find(item({ kind }), 'unlock')).toBeUndefined();
      const un = find(item({ kind, locked: true, locked_by_me: true }), 'unlock');
      expect(un?.label).toMatch(/^Unlock/);
      expect(un?.enabled).toBe(true);
      expect(find(item({ kind, locked: true, locked_by_me: true }), 'lock')).toBeUndefined();
    });
    it(`${kind}: someone else's lock is disabled with a reason for non-admins`, () => {
      const un = find(item({ kind, locked: true }), 'unlock');
      expect(un?.enabled).toBe(false);
      expect(un?.reason).toMatch(/administrator/);
    });
    it(`${kind}: without the right to change it, Lock is disabled with a reason`, () => {
      const l = find(item({ kind, permissions: ['view'] }), 'lock');
      expect(l?.enabled).toBe(false);
      expect(l?.reason).toMatch(/cannot lock/);
    });
  }
});
