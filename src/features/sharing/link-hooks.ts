'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call, type Page, type Schemas } from '@/lib/api-client';
import type { ResourceKind } from './hooks';

export type ShareOut = Schemas['ShareOut'];
export type ShareUpdate = Schemas['ShareUpdate'];
export type HistoryItem = Schemas['ShareHistoryItem'];
export type InviteResult = Schemas['InviteResult'];
export type Acl = Schemas['AclOut'];
export type Inherited = Schemas['InheritedGrant'];
export type InheritancePreview = Schemas['InheritancePreview'];
export type AccessCheckResult = Schemas['AccessCheckOut'];
export type PermissionGrantOut = Schemas['PermissionGrantOut'];

/** Share dialog columns, in display order. */
export const SHARE_PERMS = [
  ['view', 'View', 'See and preview the item and what is inside it.'],
  ['download', 'Download', 'Download content or a ZIP of a folder.'],
  ['upload', 'Upload', 'Upload or create content here. Does not allow deleting.'],
  ['share', 'Share', 'Create or change shares within policy limits.'],
  ['sync', 'Sync', 'Allow approved sync clients. Stored only: there is no sync client yet.'],
  ['delete', 'Delete', 'Move content to the recycle bin (retention rules still apply).'],
  ['manage', 'Manage', 'Manage who has access. Not an organization-wide administrator.'],
] as const;
export type SharePerm = (typeof SHARE_PERMS)[number][0];

/** Folder permission dialog columns. */
export const ACL_PERMS = [
  ['read', 'Read'],
  ['write', 'Write'],
  ['share', 'Share'],
  ['delete', 'Delete'],
  ['manage', 'Manage'],
] as const;
export type AclPerm = (typeof ACL_PERMS)[number][0];

const KEY = ['share-link'] as const;

function useInv() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: ['shares'] });
  };
}

export function useOpenShare() {
  return useMutation({
    mutationFn: (v: { kind: ResourceKind; id: string }) =>
      call<ShareOut>(
        api.POST('/api/v1/shares/for/{resource_type}/{resource_id}', {
          params: { path: { resource_type: v.kind, resource_id: v.id } },
        }),
      ),
  });
}

export function useShareOptions(shareId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, 'one', shareId],
    enabled: !!shareId,
    queryFn: ({ signal }) =>
      call<ShareOut>(
        api.GET('/api/v1/shares/{share_id}', { params: { path: { share_id: shareId! } }, signal }),
      ),
  });
}

export function useUpdateShare(shareId: string) {
  const inv = useInv();
  return useMutation({
    mutationFn: (body: ShareUpdate) =>
      call<ShareOut>(
        api.PATCH('/api/v1/shares/{share_id}', { params: { path: { share_id: shareId } }, body }),
      ),
    onSuccess: inv,
  });
}

export function useRotateLink(shareId: string) {
  const inv = useInv();
  return useMutation({
    mutationFn: () =>
      call<ShareOut>(
        api.POST('/api/v1/shares/{share_id}/link/rotate', {
          params: { path: { share_id: shareId } },
        }),
      ),
    onSuccess: inv,
  });
}

export async function trackLink(shareId: string, event: 'copied' | 'opened' | 'emailed') {
  await api.POST('/api/v1/shares/{share_id}/link/track', {
    params: { path: { share_id: shareId } },
    body: { event },
  });
}

export function useInvite(shareId: string) {
  const inv = useInv();
  return useMutation({
    mutationFn: (v: { emails: string[]; sendEmail: boolean }) =>
      call<InviteResult>(
        api.POST('/api/v1/shares/{share_id}/invite', {
          params: { path: { share_id: shareId } },
          body: {
            users: v.emails.map((email) => ({ type: 'user' as const, email })),
            send_email: v.sendEmail,
          },
        }),
      ),
    onSuccess: inv,
  });
}

export function useAddShareGroup(shareId: string) {
  const inv = useInv();
  return useMutation({
    mutationFn: (v: { groupId: string | null; everyone: boolean; confirmBroad: boolean }) =>
      call<ShareOut>(
        api.POST('/api/v1/shares/{share_id}/groups', {
          params: { path: { share_id: shareId } },
          body: { group_id: v.groupId, everyone: v.everyone, confirm_broad: v.confirmBroad },
        }),
      ),
    onSuccess: inv,
  });
}

export function useSetSharePermissions(shareId: string) {
  const inv = useInv();
  return useMutation({
    mutationFn: (
      principals: {
        type: 'user' | 'group' | 'organization';
        id: string;
        permissions: SharePerm[];
      }[],
    ) =>
      call<ShareOut>(
        api.PATCH('/api/v1/shares/{share_id}/permissions', {
          params: { path: { share_id: shareId } },
          body: { principals },
        }),
      ),
    onSuccess: inv,
  });
}

export function useRemoveRecipient(shareId: string) {
  const inv = useInv();
  return useMutation({
    mutationFn: (v: { type: 'user' | 'group' | 'organization'; id: string }) =>
      call<ShareOut>(
        api.DELETE('/api/v1/shares/{share_id}/recipients/{recipient_type}/{recipient_id}', {
          params: { path: { share_id: shareId, recipient_type: v.type, recipient_id: v.id } },
        }),
      ),
    onSuccess: inv,
  });
}

export function useRemoveShare(shareId: string) {
  const inv = useInv();
  return useMutation({
    mutationFn: () =>
      call<ShareOut>(
        api.DELETE('/api/v1/shares/{share_id}', { params: { path: { share_id: shareId } } }),
      ),
    onSuccess: inv,
  });
}

export function useShareHistory(shareId: string | undefined, offset: number) {
  return useQuery({
    queryKey: [...KEY, 'history', shareId, offset],
    enabled: !!shareId,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<HistoryItem>>(
        api.GET('/api/v1/shares/{share_id}/history', {
          params: { path: { share_id: shareId! }, query: { limit: 20, offset } },
          signal,
        }),
      ),
  });
}

// ---- Manage Folder Permissions
const ACL = ['acl-view'] as const;

export function useAclView(kind: ResourceKind, id: string, enabled = true) {
  return useQuery({
    queryKey: [...ACL, kind, id],
    enabled,
    queryFn: ({ signal }) =>
      call<Acl>(
        api.GET('/api/v1/resources/{kind}/{resource_id}/acl', {
          params: { path: { kind, resource_id: id } },
          signal,
        }),
      ),
  });
}

function useAclInv() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ACL });
    void qc.invalidateQueries({ queryKey: ['acl'] });
    void qc.invalidateQueries({ queryKey: ['children'] });
    void qc.invalidateQueries({ queryKey: ['folder'] });
  };
}

export function useSetPrincipal(kind: ResourceKind, id: string) {
  const inv = useAclInv();
  return useMutation({
    mutationFn: (v: {
      subjectType: 'user' | 'group' | 'organization';
      subjectId: string | null;
      permissions: AclPerm[];
      inherit?: boolean;
    }) =>
      call<PermissionGrantOut>(
        api.PUT('/api/v1/resources/{kind}/{resource_id}/acl/principals', {
          params: { path: { kind, resource_id: id } },
          body: {
            subject_type: v.subjectType,
            subject_id: v.subjectId,
            permissions: v.permissions,
            inherit: v.inherit ?? true,
          },
        }),
      ),
    onSuccess: inv,
  });
}

export function useRevokeAclGrant(kind: ResourceKind, id: string) {
  const inv = useAclInv();
  return useMutation({
    mutationFn: async (grantId: string) => {
      if (kind === 'folder')
        await api.DELETE('/api/v1/folders/{folder_id}/permissions/{grant_id}', {
          params: { path: { folder_id: id, grant_id: grantId } },
        });
      else
        await api.DELETE('/api/v1/documents/{document_id}/permissions/{grant_id}', {
          params: { path: { document_id: id, grant_id: grantId } },
        });
    },
    onSuccess: inv,
  });
}

export function useInheritancePreview(folderId: string) {
  return useMutation({
    mutationFn: (inherit: boolean) =>
      call<InheritancePreview>(
        api.POST('/api/v1/resources/folder/{folder_id}/inheritance/preview', {
          params: { path: { folder_id: folderId } },
          body: { inherit },
        }),
      ),
  });
}

export function useSetInheritance(folderId: string) {
  const inv = useAclInv();
  return useMutation({
    mutationFn: (v: { inherit: boolean; convert: boolean; confirm: boolean }) =>
      call<Acl>(
        api.PUT('/api/v1/resources/folder/{folder_id}/inheritance', {
          params: { path: { folder_id: folderId } },
          body: { inherit: v.inherit, convert_inherited: v.convert, confirm: v.confirm },
        }),
      ),
    onSuccess: inv,
  });
}

export function useCheckAccess(kind: ResourceKind, id: string) {
  return useMutation({
    mutationFn: (email: string) =>
      call<AccessCheckResult>(
        api.POST('/api/v1/resources/{kind}/{resource_id}/check-access', {
          params: { path: { kind, resource_id: id } },
          body: { email },
        }),
      ),
  });
}

export async function resolveShareLink(token: string) {
  return call<Schemas['LinkResolveOut']>(
    api.POST('/api/v1/share-links/resolve', { body: { token } }),
  );
}
