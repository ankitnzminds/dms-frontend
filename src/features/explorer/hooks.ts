'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call, isApiError, type Page, type Schemas, type TreeItem } from '@/lib/api-client';

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
            body: {},
          }),
        );
      else
        await api.DELETE('/api/v1/documents/{document_id}/lock', {
          params: { path: { document_id: v.id } },
        });
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
  if (isApiError(e) && e.code === 'document_locked')
    return 'This document is checked out by someone else. Ask them to check it in, or ask an administrator to break the lock.';
  return null;
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
