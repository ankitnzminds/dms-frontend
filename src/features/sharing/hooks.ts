'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  call,
  type Group,
  type Organization,
  type Page,
  type PermissionGrant,
  type PermissionGrantIn,
  type ReceivedShare,
  type Share,
  type ShareCreate,
} from '@/lib/api-client';

export type ResourceKind = 'folder' | 'document';

export function useOrganization() {
  return useQuery({
    queryKey: ['organization'],
    queryFn: ({ signal }) => call<Organization>(api.GET('/api/v1/organization', { signal })),
    staleTime: 60_000,
  });
}

export function useReceivedShares(p: { includeInactive: boolean; limit: number; offset: number }) {
  return useQuery({
    queryKey: ['shares', 'received', p],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<ReceivedShare>>(
        api.GET('/api/v1/shares/received', {
          params: {
            query: { include_inactive: p.includeInactive, limit: p.limit, offset: p.offset },
          },
          signal,
        }),
      ),
  });
}

export function useSentShares(p: {
  scope: 'mine' | 'all';
  includeInactive: boolean;
  limit: number;
  offset: number;
}) {
  return useQuery({
    queryKey: ['shares', 'sent', p],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<Share>>(
        api.GET('/api/v1/shares/sent', {
          params: {
            query: {
              scope: p.scope,
              include_inactive: p.includeInactive,
              limit: p.limit,
              offset: p.offset,
            },
          },
          signal,
        }),
      ),
  });
}

export function useResourceShares(kind: ResourceKind, id: string, enabled = true) {
  return useQuery({
    queryKey: ['shares', 'resource', kind, id],
    enabled,
    queryFn: ({ signal }) =>
      kind === 'document'
        ? call<Share[]>(
            api.GET('/api/v1/documents/{document_id}/shares', {
              params: { path: { document_id: id } },
              signal,
            }),
          )
        : call<Share[]>(
            api.GET('/api/v1/folders/{folder_id}/shares', {
              params: { path: { folder_id: id } },
              signal,
            }),
          ),
  });
}

export function useCreateShare(kind: ResourceKind, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ShareCreate) =>
      kind === 'document'
        ? call<Share>(
            api.POST('/api/v1/documents/{document_id}/shares', {
              params: { path: { document_id: id } },
              body,
            }),
          )
        : call<Share>(
            api.POST('/api/v1/folders/{folder_id}/shares', {
              params: { path: { folder_id: id } },
              body,
            }),
          ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shares'] }),
  });
}

export function useRevokeShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shareId: string) =>
      call<Share>(
        api.POST('/api/v1/shares/{share_id}/revoke', { params: { path: { share_id: shareId } } }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shares'] }),
  });
}

/** Open to all members; used to pick group recipients. */
export function useGroups(q = '') {
  return useQuery({
    queryKey: ['groups', q],
    queryFn: ({ signal }) =>
      call<Page<Group>>(
        api.GET('/api/v1/admin/groups', {
          params: { query: { q: q || undefined, limit: 100 } },
          signal,
        }),
      ),
    staleTime: 30_000,
  });
}

export function useAcl(kind: ResourceKind, id: string, enabled = true) {
  return useQuery({
    queryKey: ['acl', kind, id],
    enabled,
    queryFn: ({ signal }) =>
      kind === 'document'
        ? call<PermissionGrant[]>(
            api.GET('/api/v1/documents/{document_id}/permissions', {
              params: { path: { document_id: id } },
              signal,
            }),
          )
        : call<PermissionGrant[]>(
            api.GET('/api/v1/folders/{folder_id}/permissions', {
              params: { path: { folder_id: id } },
              signal,
            }),
          ),
  });
}

export function useAddGrant(kind: ResourceKind, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PermissionGrantIn) =>
      kind === 'document'
        ? call<PermissionGrant>(
            api.POST('/api/v1/documents/{document_id}/permissions', {
              params: { path: { document_id: id } },
              body,
            }),
          )
        : call<PermissionGrant>(
            api.POST('/api/v1/folders/{folder_id}/permissions', {
              params: { path: { folder_id: id } },
              body,
            }),
          ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['acl', kind, id] }),
  });
}

export function useRevokeGrant(kind: ResourceKind, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (grantId: string) => {
      if (kind === 'document')
        await api.DELETE('/api/v1/documents/{document_id}/permissions/{grant_id}', {
          params: { path: { document_id: id, grant_id: grantId } },
        });
      else
        await api.DELETE('/api/v1/folders/{folder_id}/permissions/{grant_id}', {
          params: { path: { folder_id: id, grant_id: grantId } },
        });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['acl', kind, id] }),
  });
}
