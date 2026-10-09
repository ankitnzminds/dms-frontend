'use client';

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, call, type Page, type Schemas } from '@/lib/api-client';

export type AdminUser = Schemas['AdminUserOut'];
export type AdminUserCreate = Schemas['AdminUserCreate'];
export type AdminUserUpdate = Schemas['AdminUserUpdate'];
export type ActivityEvent = Schemas['ActivityEventOut'];
export type PolicyOverrides = Record<string, Record<string, unknown>>;

export type StatusFilter = 'all' | 'guest' | 'full' | 'external' | 'disabled';
export type SourceFilter = 'default' | 'invitation' | 'csv_import' | 'directory';
export type SortField = 'email' | 'display_name' | 'last_login_at' | 'created_at' | 'username';

export interface UserFilters {
  q: string;
  status: StatusFilter;
  source?: SourceFilter;
  sort: SortField;
  descending: boolean;
  limit: number;
  offset: number;
}

const KEY = ['admin-users'] as const;

export function useAdminUsers(f: UserFilters) {
  return useQuery({
    queryKey: [...KEY, 'list', f],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<AdminUser>>(
        api.GET('/api/v1/admin/users', {
          params: { query: { ...f, q: f.q || undefined } },
          signal,
        }),
      ),
  });
}

export function useAdminUser(userId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, 'one', userId],
    enabled: !!userId,
    queryFn: ({ signal }) =>
      call<AdminUser>(
        api.GET('/api/v1/admin/users/{user_id}', {
          params: { path: { user_id: userId! } },
          signal,
        }),
      ),
  });
}

function useUserMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ['admin', 'members'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'groups'] });
    },
  });
}

export function useCreateUser() {
  return useUserMutation((body: AdminUserCreate) =>
    call<Schemas['AdminUserCreated']>(api.POST('/api/v1/admin/users', { body })),
  );
}

export function useUpdateUser() {
  return useUserMutation((v: { userId: string; body: AdminUserUpdate }) =>
    call<AdminUser>(
      api.PATCH('/api/v1/admin/users/{user_id}', {
        params: { path: { user_id: v.userId } },
        body: v.body,
      }),
    ),
  );
}

export function useSetEnabled() {
  return useUserMutation((v: { userId: string; enabled: boolean }) =>
    call<AdminUser>(
      v.enabled
        ? api.POST('/api/v1/admin/users/{user_id}/reactivate', {
            params: { path: { user_id: v.userId } },
          })
        : api.POST('/api/v1/admin/users/{user_id}/deactivate', {
            params: { path: { user_id: v.userId } },
          }),
    ),
  );
}

export function useReplaceGroups() {
  return useUserMutation((v: { userId: string; groupIds: string[] }) =>
    call<AdminUser>(
      api.PUT('/api/v1/admin/users/{user_id}/groups', {
        params: { path: { user_id: v.userId } },
        body: { group_ids: v.groupIds },
      }),
    ),
  );
}

export function useDeleteImpact(userId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, 'impact', userId],
    enabled: !!userId,
    gcTime: 0,
    queryFn: ({ signal }) =>
      call<Schemas['DeleteImpact']>(
        api.GET('/api/v1/admin/users/{user_id}/delete-impact', {
          params: { path: { user_id: userId! } },
          signal,
        }),
      ),
  });
}

export function useDeleteUser() {
  return useUserMutation(async (v: { userId: string; email: string }) => {
    await api.POST('/api/v1/admin/users/{user_id}/delete', {
      params: { path: { user_id: v.userId } },
      body: { confirm: true, confirm_email: v.email },
    });
  });
}

export function useUserQuota(userId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, 'quota', userId],
    enabled: !!userId,
    queryFn: ({ signal }) =>
      call<Schemas['QuotaOut']>(
        api.GET('/api/v1/admin/users/{user_id}/quota', {
          params: { path: { user_id: userId! } },
          signal,
        }),
      ),
  });
}

export function useUserShares(userId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, 'shares', userId],
    enabled: !!userId && enabled,
    queryFn: ({ signal }) =>
      call<Schemas['UserShareOut'][]>(
        api.GET('/api/v1/admin/users/{user_id}/shares', {
          params: { path: { user_id: userId! } },
          signal,
        }),
      ),
  });
}

export function useAdmins() {
  return useQuery({
    queryKey: [...KEY, 'admins'],
    queryFn: ({ signal }) =>
      call<Schemas['AdminOut'][]>(api.GET('/api/v1/admin/admins', { signal })),
  });
}

// ---- import / export
export function usePreviewImport() {
  return useMutation({
    mutationFn: (csv: string) =>
      call<Schemas['ImportPreviewOut']>(
        api.POST('/api/v1/admin/users/import/preview', { body: { csv } }),
      ),
  });
}

export function useCommitImport() {
  return useUserMutation((csv: string) =>
    call<Schemas['ImportResultOut']>(api.POST('/api/v1/admin/users/import', { body: { csv } })),
  );
}

async function blobOf(p: Promise<{ data?: unknown }>): Promise<Blob> {
  return (await p).data as Blob;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const fetchImportTemplate = () =>
  blobOf(api.GET('/api/v1/admin/users/import/template', { parseAs: 'blob' }));

export const exportUsers = (f: Pick<UserFilters, 'q' | 'status' | 'source'>) =>
  blobOf(
    api.GET('/api/v1/admin/users/export', {
      params: { query: { ...f, q: f.q || undefined } },
      parseAs: 'blob',
    }),
  );

// ---- policies
export interface PolicyCatalog {
  defaults: PolicyOverrides;
  enforced: string[];
}

export function usePolicyCatalog() {
  return useQuery({
    queryKey: [...KEY, 'policy-catalog'],
    staleTime: Infinity,
    queryFn: ({ signal }) =>
      call<unknown>(
        api.GET('/api/v1/admin/policies/defaults', { signal }),
      ) as Promise<PolicyCatalog>,
  });
}

export type PolicyScope =
  { kind: 'organization' } | { kind: 'group'; id: string } | { kind: 'user'; id: string };

const scopeKey = (s: PolicyScope) => (s.kind === 'organization' ? 'org' : `${s.kind}-${s.id}`);

export function useStoredPolicy(scope: PolicyScope) {
  return useQuery({
    queryKey: [...KEY, 'policy', scopeKey(scope)],
    gcTime: 0,
    queryFn: ({ signal }) => {
      if (scope.kind === 'organization')
        return call<Schemas['PolicyDocument']>(
          api.GET('/api/v1/admin/policies/organization', { signal }),
        );
      if (scope.kind === 'group')
        return call<Schemas['PolicyDocument']>(
          api.GET('/api/v1/admin/groups/{group_id}/policy', {
            params: { path: { group_id: scope.id } },
            signal,
          }),
        );
      return call<Schemas['PolicyDocument']>(
        api.GET('/api/v1/admin/users/{user_id}/policy', {
          params: { path: { user_id: scope.id } },
          signal,
        }),
      );
    },
  });
}

export function useEffectivePolicy(userId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, 'policy-effective', userId],
    enabled: !!userId,
    gcTime: 0,
    queryFn: ({ signal }) =>
      call<Schemas['EffectivePolicyOut']>(
        api.GET('/api/v1/admin/users/{user_id}/policy/effective', {
          params: { path: { user_id: userId! } },
          signal,
        }),
      ),
  });
}

export function useSavePolicy(scope: PolicyScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { overrides: PolicyOverrides; expectedVersion: number }) => {
      const body = { overrides: v.overrides, expected_version: v.expectedVersion };
      if (scope.kind === 'organization')
        return call<Schemas['PolicyDocument']>(
          api.PUT('/api/v1/admin/policies/organization', { body }),
        );
      if (scope.kind === 'group')
        return call<Schemas['PolicyDocument']>(
          api.PUT('/api/v1/admin/groups/{group_id}/policy', {
            params: { path: { group_id: scope.id } },
            body,
          }),
        );
      return call<Schemas['PolicyDocument']>(
        api.PUT('/api/v1/admin/users/{user_id}/policy', {
          params: { path: { user_id: scope.id } },
          body,
        }),
      );
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

// ---- activity
export interface ActivityFilters {
  userId?: string;
  category?: string;
  action?: string;
  outcome?: 'success' | 'denied' | 'failure';
  since?: string;
  until?: string;
}

export function useActivity(f: ActivityFilters) {
  return useInfiniteQuery({
    queryKey: [...KEY, 'activity', f],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }): Promise<Schemas['ActivityPage']> => {
      const query = {
        category: f.category || undefined,
        action: f.action || undefined,
        outcome: f.outcome,
        since: f.since,
        until: f.until,
        cursor: pageParam,
        limit: 25,
      };
      const res = f.userId
        ? await api.GET('/api/v1/admin/users/{user_id}/activity', {
            params: { path: { user_id: f.userId }, query },
            signal,
          })
        : await api.GET('/api/v1/admin/activity', { params: { query }, signal });
      return res.data as Schemas['ActivityPage'];
    },
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}

export const exportActivity = (f: ActivityFilters) =>
  blobOf(
    api.GET('/api/v1/admin/activity/export', {
      params: {
        query: {
          user_id: f.userId,
          category: f.category || undefined,
          action: f.action || undefined,
          outcome: f.outcome,
          since: f.since,
          until: f.until,
        },
      },
      parseAs: 'blob',
    }),
  );

export function useAuditPolicy() {
  return useQuery({
    queryKey: [...KEY, 'audit-policy'],
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      call<Schemas['AuditPolicyOut']>(api.GET('/api/v1/admin/audit-policy', { signal })),
  });
}
