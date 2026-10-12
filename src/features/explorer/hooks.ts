'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  call,
  friendlyMessage,
  isApiError,
  type Page,
  type Schemas,
  type TreeItem,
} from '@/lib/api-client';

export type ItemRef = Schemas['ItemRef'];
export type BulkResult = Schemas['BulkResult'];
export type BulkItemResult = Schemas['BulkItemResult'];
export type ItemProperties = Schemas['ItemProperties'];
export type LockInfo = Schemas['LockOut'];
export type OnConflict = 'fail' | 'rename' | 'skip';

const FILE_KEYS = [
  'children',
  'folder',
  'document',
  'recent',
  'starred',
  'favorites',
  'trash',
  'search',
  'usage',
  'tree',
];

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    for (const k of FILE_KEYS) void qc.invalidateQueries({ queryKey: [k] });
  };
}

export function useBulkMove() {
  const inv = useInvalidateAll();
  return useMutation({
    mutationFn: (v: { items: ItemRef[]; target: string; onConflict: OnConflict }) =>
      call<BulkResult>(
        api.POST('/api/v1/items/bulk/move', {
          body: { items: v.items, target_folder_id: v.target, on_conflict: v.onConflict },
        }),
      ),
    onSettled: inv,
  });
}

export function useBulkCopy() {
  const inv = useInvalidateAll();
  return useMutation({
    mutationFn: (v: { items: ItemRef[]; target: string; onConflict: OnConflict }) =>
      call<BulkResult>(
        api.POST('/api/v1/items/bulk/copy', {
          body: { items: v.items, target_folder_id: v.target, on_conflict: v.onConflict },
        }),
      ),
    onSettled: inv,
  });
}

export function useBulkDelete() {
  const inv = useInvalidateAll();
  return useMutation({
    mutationFn: (items: ItemRef[]) =>
      call<BulkResult>(api.POST('/api/v1/items/bulk/delete', { body: { items } })),
    onSettled: inv,
  });
}

/** Recursive folder copy (a single folder to a target). */
export function useFolderCopy() {
  const inv = useInvalidateAll();
  return useMutation({
    mutationFn: (v: { id: string; target: string; name?: string }) =>
      call<Schemas['FolderCopyOut']>(
        api.POST('/api/v1/folders/{folder_id}/copy', {
          params: { path: { folder_id: v.id } },
          body: { target_folder_id: v.target, name: v.name ?? null },
        }),
      ),
    onSettled: inv,
  });
}

export function useFavorites(limit = 50) {
  return useQuery({
    queryKey: ['favorites', limit],
    queryFn: ({ signal }) =>
      call<Page<TreeItem>>(
        api.GET('/api/v1/favorites', { params: { query: { limit, offset: 0 } }, signal }),
      ),
    staleTime: 15_000,
  });
}

export function useProperties(kind: 'document' | 'folder' | undefined, id: string | undefined) {
  return useQuery({
    queryKey: ['properties', kind, id],
    enabled: !!kind && !!id,
    queryFn: ({ signal }) =>
      kind === 'document'
        ? call<ItemProperties>(
            api.GET('/api/v1/documents/{document_id}/properties', {
              params: { path: { document_id: id! } },
              signal,
            }),
          )
        : call<ItemProperties>(
            api.GET('/api/v1/folders/{folder_id}/properties', {
              params: { path: { folder_id: id! } },
              signal,
            }),
          ),
  });
}

export function useLockDocument() {
  const inv = useInvalidateAll();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; lock: boolean }) => {
      if (v.lock)
        await call<LockInfo>(
          api.POST('/api/v1/documents/{document_id}/lock', {
            params: { path: { document_id: v.id } },
            body: { no_expiry: false, prevent_download: false },
          }),
        );
      else
        await call(
          api.DELETE('/api/v1/documents/{document_id}/lock', {
            params: { path: { document_id: v.id } },
          }),
        );
    },
    onSuccess: () => {
      inv();
      void qc.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}

/** Idempotent find-or-create of nested folders below `parentId`. */
export function ensurePath(parentId: string, path: string[]) {
  return call<Schemas['EnsurePathOut']>(
    api.POST('/api/v1/folders/{folder_id}/ensure-path', {
      params: { path: { folder_id: parentId } },
      body: { path },
    }),
  );
}

/** Lazy children (folders only) for the sidebar tree. */
export function useFolderChildren(folderId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['tree', folderId],
    enabled: !!folderId && enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<TreeItem>>(
        api.GET('/api/v1/folders/{folder_id}/children', {
          params: {
            path: { folder_id: folderId! },
            query: { kind: 'folder', limit: 200, offset: 0, sort: 'name', order: 'asc' },
          },
          signal,
        }),
      ),
    staleTime: 20_000,
  });
}

export function lockErrorText(e: unknown): string | null {
  if (!isApiError(e)) return null;
  if (e.code === 'document_locked')
    return 'This document is locked by someone else. Ask them to unlock it, or ask an administrator to break the lock.';
  if (e.code === 'folder_locked')
    return 'This folder is locked by someone else. Ask them to unlock it, or ask an administrator to break the lock.';
  if (e.code === 'download_blocked_by_lock')
    return 'Downloading is turned off while someone else has this locked.';
  if (e.code === 'lock_in_the_past') return 'Choose a lock end time in the future.';
  if (e.code === 'lock_too_long') return 'A lock can last at most one year.';
  return null;
}

export interface LockOptions {
  /** ISO time the lock ends; null = never expires. */
  expiresAt: string | null;
  preventDownload: boolean;
}
export interface LockTarget {
  kind: 'folder' | 'document';
  id: string;
  name: string;
}
export interface LockResult {
  target: LockTarget;
  ok: boolean;
  message?: string;
}

async function lockOne(t: LockTarget, lock: boolean, o?: LockOptions) {
  const body = {
    no_expiry: !o?.expiresAt,
    expires_at: o?.expiresAt ?? null,
    prevent_download: !!o?.preventDownload,
  };
  if (t.kind === 'folder') {
    if (lock)
      await call<LockInfo>(
        api.POST('/api/v1/folders/{folder_id}/lock', {
          params: { path: { folder_id: t.id } },
          body,
        }),
      );
    else
      await call(
        api.DELETE('/api/v1/folders/{folder_id}/lock', { params: { path: { folder_id: t.id } } }),
      );
  } else if (lock) {
    await call<LockInfo>(
      api.POST('/api/v1/documents/{document_id}/lock', {
        params: { path: { document_id: t.id } },
        body,
      }),
    );
  } else {
    await call(
      api.DELETE('/api/v1/documents/{document_id}/lock', {
        params: { path: { document_id: t.id } },
      }),
    );
  }
}

/**
 * Lock or unlock one or many files / folders. Every item is attempted on its own and reported on its own:
 * the server decides each (permissions, someone else's lock, expiry), nothing is silently skipped.
 */
export function useLockItems() {
  const inv = useInvalidateAll();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      targets: LockTarget[];
      lock: boolean;
      options?: LockOptions;
    }): Promise<LockResult[]> => {
      const out: LockResult[] = [];
      for (const target of v.targets) {
        try {
          await lockOne(target, v.lock, v.options);
          out.push({ target, ok: true });
        } catch (e) {
          out.push({ target, ok: false, message: lockErrorText(e) ?? friendlyMessage(e) });
        }
      }
      return out;
    },
    onSettled: () => {
      inv();
      for (const k of ['properties', 'tree', 'favorites', 'folder', 'document'])
        void qc.invalidateQueries({ queryKey: [k] });
    },
  });
}

/** Summarise a bulk result for the user. Never silent partial success. */
export function summarize(r: BulkResult, verb: string): string {
  const parts = [`${r.succeeded} ${verb}`];
  if (r.skipped) parts.push(`${r.skipped} skipped`);
  if (r.failed) parts.push(`${r.failed} failed`);
  return parts.join(', ');
}

export const hasProblems = (r: BulkResult) => r.failed > 0 || r.skipped > 0;
export const isNameConflict = (x: BulkItemResult) =>
  x.status === 'error' && x.code === 'name_conflict';
