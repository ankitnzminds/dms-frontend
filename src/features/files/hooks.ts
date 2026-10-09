'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  call,
  type Document,
  type Folder,
  type Classification,
  type Page,
  type SearchResult,
  type TrashItem,
  type TreeItem,
  type Version,
} from '@/lib/api-client';

export type SortKey = 'name' | 'updated_at' | 'size' | 'type' | 'modified_by';
export type SortOrder = 'asc' | 'desc';

export interface ChildrenParams {
  limit: number;
  offset: number;
  sort: SortKey;
  order: SortOrder;
  kind?: 'folder' | 'document';
}

const hasProcessing = (items: { status?: string | null }[] | undefined) =>
  !!items?.some((i) => i.status === 'processing');

export function useRootFolder() {
  return useQuery({
    queryKey: ['root'],
    queryFn: ({ signal }) => call<Folder>(api.GET('/api/v1/folders/root', { signal })),
    staleTime: 5 * 60_000,
  });
}

export function useFolder(id: string | undefined) {
  return useQuery({
    queryKey: ['folder', id],
    enabled: !!id,
    queryFn: ({ signal }) =>
      call<Folder>(
        api.GET('/api/v1/folders/{folder_id}', { params: { path: { folder_id: id! } }, signal }),
      ),
  });
}

export function useChildren(
  id: string | undefined,
  p: ChildrenParams,
  opts?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['children', id, p],
    enabled: !!id && (opts?.enabled ?? true),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<TreeItem>>(
        api.GET('/api/v1/folders/{folder_id}/children', {
          params: { path: { folder_id: id! }, query: p },
          signal,
        }),
      ),
    // Poll while anything is being scanned.
    refetchInterval: (q) => (hasProcessing(q.state.data?.items) ? 2500 : false),
  });
}

export function useDocument(id: string | undefined) {
  return useQuery({
    queryKey: ['document', id],
    enabled: !!id,
    queryFn: ({ signal }) =>
      call<Document>(
        api.GET('/api/v1/documents/{document_id}', {
          params: { path: { document_id: id! } },
          signal,
        }),
      ),
    refetchInterval: (q) => (q.state.data?.status === 'processing' ? 2500 : false),
  });
}

export function useVersions(id: string | undefined, polling = false) {
  return useQuery({
    queryKey: ['versions', id],
    enabled: !!id,
    queryFn: ({ signal }) =>
      call<Version[]>(
        api.GET('/api/v1/documents/{document_id}/versions', {
          params: { path: { document_id: id! } },
          signal,
        }),
      ),
    refetchInterval: (q) =>
      polling || q.state.data?.some((v) => v.scan_status === 'pending') ? 2500 : false,
  });
}

export function useRecent(limit = 20, offset = 0) {
  return useQuery({
    queryKey: ['recent', limit, offset],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<TreeItem>>(
        api.GET('/api/v1/recent', { params: { query: { limit, offset } }, signal }),
      ),
    refetchInterval: (q) => (hasProcessing(q.state.data?.items) ? 2500 : false),
  });
}

export function useStarred(limit = 50, offset = 0) {
  return useQuery({
    queryKey: ['starred', limit, offset],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<TreeItem>>(
        api.GET('/api/v1/starred', { params: { query: { limit, offset } }, signal }),
      ),
  });
}

export function useTrash(limit = 50, offset = 0) {
  return useQuery({
    queryKey: ['trash', limit, offset],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<TrashItem>>(
        api.GET('/api/v1/trash', { params: { query: { limit, offset } }, signal }),
      ),
  });
}

export interface SearchParams {
  q: string;
  scope?: 'all' | 'name' | 'content';
  meta?: string[];
  kind?: 'folder' | 'document';
  content_type?: string;
  owner_id?: string;
  modified_after?: string;
  modified_before?: string;
  folder_id?: string;
  limit: number;
  offset: number;
}

export function useSearch(p: SearchParams) {
  return useQuery({
    queryKey: ['search', p],
    enabled: p.q.trim().length > 0,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<SearchResult>>(api.GET('/api/v1/search', { params: { query: p }, signal })),
    refetchInterval: (q) => (hasProcessing(q.state.data?.items) ? 2500 : false),
  });
}

/** Invalidate everything that lists files; cheap and correct after any structural mutation. */
export function useInvalidateFiles() {
  const qc = useQueryClient();
  return () => {
    for (const k of [
      'children',
      'folder',
      'document',
      'recent',
      'starred',
      'trash',
      'search',
      'usage',
    ])
      void qc.invalidateQueries({ queryKey: [k] });
  };
}

export function useCreateFolder() {
  const inv = useInvalidateFiles();
  return useMutation({
    mutationFn: (v: { parent_folder_id: string; name: string }) =>
      call<Folder>(api.POST('/api/v1/folders', { body: v })),
    onSuccess: inv,
  });
}

export interface RenameMoveInput {
  kind: 'folder' | 'document';
  id: string;
  name?: string;
  parentId?: string;
  expectedRowVersion?: number | null;
}

/** Rename and/or move (folder: parent_folder_id, document: folder_id). */
export function useUpdateItem() {
  const inv = useInvalidateFiles();
  return useMutation({
    mutationFn: (v: RenameMoveInput): Promise<Folder | Document> =>
      v.kind === 'folder'
        ? call<Folder>(
            api.PATCH('/api/v1/folders/{folder_id}', {
              params: { path: { folder_id: v.id } },
              body: {
                name: v.name,
                parent_folder_id: v.parentId,
                expected_row_version: v.expectedRowVersion ?? undefined,
              },
            }),
          )
        : call<Document>(
            api.PATCH('/api/v1/documents/{document_id}', {
              params: { path: { document_id: v.id } },
              body: {
                name: v.name,
                folder_id: v.parentId,
                expected_row_version: v.expectedRowVersion ?? undefined,
              },
            }),
          ),
    onSuccess: inv,
  });
}

export function useUpdateDocumentMeta() {
  const inv = useInvalidateFiles();
  return useMutation({
    mutationFn: (v: {
      id: string;
      classification?: Classification;
      expectedRowVersion?: number | null;
    }) =>
      call<Document>(
        api.PATCH('/api/v1/documents/{document_id}', {
          params: { path: { document_id: v.id } },
          body: {
            classification: v.classification,
            expected_row_version: v.expectedRowVersion ?? undefined,
          },
        }),
      ),
    onSuccess: inv,
  });
}

export function useDeleteItem() {
  const inv = useInvalidateFiles();
  return useMutation({
    mutationFn: async (v: { kind: 'folder' | 'document'; id: string }) => {
      if (v.kind === 'folder')
        await api.DELETE('/api/v1/folders/{folder_id}', { params: { path: { folder_id: v.id } } });
      else
        await api.DELETE('/api/v1/documents/{document_id}', {
          params: { path: { document_id: v.id } },
        });
    },
    onSuccess: inv,
  });
}

export function useRestoreItem() {
  const inv = useInvalidateFiles();
  return useMutation({
    mutationFn: async (v: { kind: 'folder' | 'document'; id: string; newName?: string }) => {
      const body = v.newName ? { new_name: v.newName } : undefined;
      if (v.kind === 'folder')
        return call<Folder>(
          api.POST('/api/v1/folders/{folder_id}/restore', {
            params: { path: { folder_id: v.id } },
            body: body as never,
          }),
        );
      return call<Document>(
        api.POST('/api/v1/documents/{document_id}/restore', {
          params: { path: { document_id: v.id } },
          body,
        }),
      );
    },
    onSuccess: inv,
  });
}

export function useCopyDocument() {
  const inv = useInvalidateFiles();
  return useMutation({
    mutationFn: (v: { id: string; target_folder_id: string; name?: string }) =>
      call<Document>(
        api.POST('/api/v1/documents/{document_id}/copy', {
          params: { path: { document_id: v.id } },
          body: { target_folder_id: v.target_folder_id, name: v.name },
        }),
      ),
    onSuccess: inv,
  });
}

/** Documents are starred; folders are pinned (Quick Access favorites). */
export function useToggleStar() {
  const inv = useInvalidateFiles();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; starred: boolean; kind?: 'folder' | 'document' }) => {
      if (v.kind === 'folder') {
        if (v.starred)
          await api.PUT('/api/v1/folders/{folder_id}/favorite', {
            params: { path: { folder_id: v.id } },
          });
        else
          await api.DELETE('/api/v1/folders/{folder_id}/favorite', {
            params: { path: { folder_id: v.id } },
          });
      } else if (v.starred)
        await api.PUT('/api/v1/documents/{document_id}/star', {
          params: { path: { document_id: v.id } },
        });
      else
        await api.DELETE('/api/v1/documents/{document_id}/star', {
          params: { path: { document_id: v.id } },
        });
    },
    onSuccess: () => {
      inv();
      void qc.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}

export function useRestoreVersion(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (n: number) =>
      call<Version>(
        api.POST('/api/v1/documents/{document_id}/versions/{version_number}/restore', {
          params: { path: { document_id: documentId, version_number: n } },
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['versions', documentId] });
      void qc.invalidateQueries({ queryKey: ['document', documentId] });
      void qc.invalidateQueries({ queryKey: ['usage'] });
    },
  });
}

export function useOrgUsage() {
  return useQuery({
    queryKey: ['usage'],
    queryFn: ({ signal }) => call(api.GET('/api/v1/organization/usage', { signal })),
    refetchInterval: 15_000,
  });
}

export function useProcessing(id: string | undefined, poll = false) {
  return useQuery({
    queryKey: ['processing', id],
    enabled: !!id,
    queryFn: ({ signal }) =>
      call<import('@/lib/api-client').Schemas['ProcessingStatusOut']>(
        api.GET('/api/v1/documents/{document_id}/processing', {
          params: { path: { document_id: id! } },
          signal,
        }),
      ),
    refetchInterval: (q) =>
      poll && q.state.data && ['pending', 'processing'].includes(q.state.data.text_status ?? '')
        ? 3000
        : false,
  });
}
