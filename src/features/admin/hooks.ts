'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  call,
  type AuditEvent,
  type Group,
  type Member,
  type Organization,
  type Page,
  type QuarantineItem,
  type Schemas,
} from '@/lib/api-client';

export interface MemberFilters {
  q: string;
  status?: Schemas['MemberOut']['membership_status'];
  role?: Schemas['MemberOut']['role'];
  limit: number;
  offset: number;
}

export function useAdminMembers(f: MemberFilters, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'members', f],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<Member>>(
        api.GET('/api/v1/admin/members', {
          params: {
            query: {
              q: f.q || undefined,
              status: f.status,
              role: f.role,
              limit: f.limit,
              offset: f.offset,
            },
          },
          signal,
        }),
      ),
  });
}

function useAdminMutation<V, R>(fn: (v: V) => Promise<R>, keys: string[][]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => keys.forEach((k) => void qc.invalidateQueries({ queryKey: k })),
  });
}

export function useInviteMember() {
  return useAdminMutation(
    (b: Schemas['InviteRequest']) => call<Member>(api.POST('/api/v1/admin/members', { body: b })),
    [['admin', 'members']],
  );
}

export function useUpdateMember() {
  return useAdminMutation(
    (v: { userId: string; body: Schemas['MemberUpdate'] }) =>
      call<Member>(api.PATCH('/api/v1/admin/members/{user_id}', { params: { path: { user_id: v.userId } }, body: v.body })),
    [['admin', 'members']],
  );
}

export function useRevokeSessions() {
  return useAdminMutation(
    async (userId: string) => {
      await api.POST('/api/v1/admin/members/{user_id}/revoke-sessions', { params: { path: { user_id: userId } } });
    },
    [],
  );
}

export function useAdminGroups(q = '', limit = 100, offset = 0) {
  return useQuery({
    queryKey: ['admin', 'groups', q, limit, offset],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<Group>>(
        api.GET('/api/v1/admin/groups', { params: { query: { q: q || undefined, limit, offset } }, signal }),
      ),
  });
}

export function useCreateGroup() {
  return useAdminMutation(
    (b: Schemas['GroupIn']) => call<Group>(api.POST('/api/v1/admin/groups', { body: b })),
    [['admin', 'groups'], ['groups']],
  );
}

export function useUpdateGroup() {
  return useAdminMutation(
    (v: { id: string; body: Schemas['GroupUpdate'] }) =>
      call<Group>(api.PATCH('/api/v1/admin/groups/{group_id}', { params: { path: { group_id: v.id } }, body: v.body })),
    [['admin', 'groups'], ['groups']],
  );
}

export function useDeleteGroup() {
  return useAdminMutation(
    async (id: string) => {
      await api.DELETE('/api/v1/admin/groups/{group_id}', { params: { path: { group_id: id } } });
    },
    [['admin', 'groups'], ['groups']],
  );
}

export function useGroupMembers(groupId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'group-members', groupId],
    enabled: !!groupId,
    queryFn: ({ signal }) =>
      call<Member[]>(api.GET('/api/v1/admin/groups/{group_id}/members', { params: { path: { group_id: groupId! } }, signal })),
  });
}

export function useAddGroupMember(groupId: string) {
  return useAdminMutation(
    async (userId: string) => {
      await api.POST('/api/v1/admin/groups/{group_id}/members', {
        params: { path: { group_id: groupId } },
        body: { user_id: userId },
      });
    },
    [['admin', 'group-members', groupId], ['admin', 'groups']],
  );
}

export function useRemoveGroupMember(groupId: string) {
  return useAdminMutation(
    async (userId: string) => {
      await api.DELETE('/api/v1/admin/groups/{group_id}/members/{user_id}', {
        params: { path: { group_id: groupId, user_id: userId } },
      });
    },
    [['admin', 'group-members', groupId], ['admin', 'groups']],
  );
}

export interface AuditFilters {
  action?: string;
  actor_user_id?: string;
  resource_type?: string;
  resource_id?: string;
  outcome?: 'success' | 'denied' | 'failure';
  since?: string;
  until?: string;
  limit: number;
  offset: number;
}

export function useAuditEvents(f: AuditFilters, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'audit', f],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<AuditEvent>>(api.GET('/api/v1/admin/audit-events', { params: { query: f }, signal })),
  });
}

export function useQuarantine(limit = 50, offset = 0) {
  return useQuery({
    queryKey: ['admin', 'quarantine', limit, offset],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<QuarantineItem>>(api.GET('/api/v1/admin/quarantine', { params: { query: { limit, offset } }, signal })),
    refetchInterval: 10_000,
  });
}

export function useUpdateOrganization() {
  return useAdminMutation(
    (b: Schemas['OrganizationUpdate']) => call<Organization>(api.PATCH('/api/v1/organization', { body: b })),
    [['organization'], ['me']],
  );
}
