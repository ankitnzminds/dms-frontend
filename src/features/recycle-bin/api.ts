'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call, type Page, type Schemas } from '@/lib/api-client';

export type RecycleItem = Schemas['RecycleItem'];
export type RecycleDetail = Schemas['RecycleDetail'];
export type RecycleRef = Schemas['RecycleRef'];
export type RestoreItem = Schemas['RestoreItem'];
export type BulkOut = Schemas['RecycleBulkOut'];

export interface RecycleFilters {
  q: string;
  deletedBy: string;
  fileType: string;
  source: '' | 'trash' | 'user_permanent';
  dateFrom: string;
  dateTo: string;
  limit: number;
  offset: number;
}

const KEY = ['admin', 'recycle-bin'] as const;

const startOfDay = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);
const endOfDay = (d: string) => (d ? new Date(`${d}T23:59:59.999`).toISOString() : undefined);

export function useRecycleBin(f: RecycleFilters) {
  return useQuery({
    queryKey: [...KEY, 'list', f],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<RecycleItem>>(
        api.GET('/api/v1/admin/recycle-bin', {
          params: {
            query: {
              q: f.q.trim() || undefined,
              deleted_by: f.deletedBy || undefined,
              file_type: f.fileType.trim() || undefined,
              source: f.source || undefined,
              date_from: startOfDay(f.dateFrom),
              date_to: endOfDay(f.dateTo),
              limit: f.limit,
              offset: f.offset,
            },
          },
          signal,
        }),
      ),
  });
}

export function useRecycleDetail(ref: RecycleRef | null) {
  return useQuery({
    queryKey: [...KEY, 'detail', ref?.kind, ref?.id],
    enabled: !!ref,
    queryFn: ({ signal }) =>
      call<RecycleDetail>(
        api.GET('/api/v1/admin/recycle-bin/{kind}/{resource_id}', {
          params: { path: { kind: ref!.kind, resource_id: ref!.id } },
          signal,
        }),
      ),
  });
}

function useChange<V>(fn: (v: V) => Promise<BulkOut>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      for (const k of ['trash', 'children', 'folder', 'document', 'usage', 'tree', 'recent'])
        void qc.invalidateQueries({ queryKey: [k] });
    },
  });
}

export const useRestoreItems = () =>
  useChange((items: RestoreItem[]) =>
    call<BulkOut>(api.POST('/api/v1/admin/recycle-bin/restore', { body: { items } })),
  );

export const usePurgeItems = () =>
  useChange((items: RecycleRef[]) =>
    call<BulkOut>(api.POST('/api/v1/admin/recycle-bin/purge', { body: { items } })),
  );
